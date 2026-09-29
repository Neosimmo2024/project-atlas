import "server-only";
import { getTenantContext } from "./tenant-context";
import { isBrevoQaScope } from "./brevo-account-diagnostic";
import { verifyBrevoAccountBinding } from "@/services/brevo-account-binding";
import { createAuthorizedBrevoContactSource } from "./brevo-contact-source";
import { createBrevoContactJournal } from "./brevo-contact-journal";
import { syncBrevoContactWithJournal } from "@/services/brevo-contact-journal";
import { ensureBrevoPilotChannels } from "@/services/brevo-pilot-channels";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Explicit one-contact QA pilot authorized on 29 September. No arbitrary target.
export const brevoPilotPersonId = "3bc14f68-31ea-4974-a547-01f918a79c4a";
const tenantId = "8e27b0ff-3f1a-41fa-8390-628c718723a2";
const organizationId = "69aae9fea303e8f4220b4e98";
const email = "atlas-pilot-20260929@example.invalid";
export async function runBrevoContactPilot(confirmation: string) {
  const fail = (status: string) => ({ status, contactId: undefined as number | undefined });
  if (confirmation !== "create_one_blocklisted_test_contact") return fail("confirmation_required");
  if (!isBrevoQaScope() || process.env.ATLAS_BREVO_CONTACT_TENANT_ID !== tenantId
    || process.env.ATLAS_BREVO_ORGANIZATION_ID !== organizationId) return fail("scope_rejected");
  try {
    const actor = await getTenantContext();
    if (!actor || actor.role !== "owner" || actor.tenantId !== tenantId) return fail("forbidden");
    const apiKey = process.env.BREVO_API_KEY;
    const options = { enabled: true, accountTenantId: tenantId, apiKey };
    const binding = await verifyBrevoAccountBinding(tenantId, { ...options, expectedOrganizationId: organizationId });
    if (binding.status !== "verified") return fail("account_unverified");
    const source = await createAuthorizedBrevoContactSource(brevoPilotPersonId);
    const readPerson: typeof source.readPerson = async target => {
      const fresh = await getTenantContext();
      if (!fresh || fresh.role !== "owner" || fresh.userId !== actor.userId || fresh.tenantId !== tenantId) throw new Error("rejected");
      const p = await source.readPerson(target);
      if (!p || p.tenantId !== tenantId || p.personId !== brevoPilotPersonId || p.email !== email
        || !p.contactAllowed || p.doNotContact) throw new Error("rejected");
      return p;
    };
    const target = { tenantId, personId: brevoPilotPersonId };
    await readPerson(target);
    const db = await createSupabaseServerClient();
    const { data: previous, error } = await db.from("brevo_contact_sync_attempts")
      .select("provider_contact_id").eq("tenant_id", tenantId).eq("person_id", brevoPilotPersonId)
      .eq("status", "created").limit(1).maybeSingle();
    if (error) return fail("history_unavailable");
    let result;
    // A successful pilot can never recreate a contact, even if deleted in Brevo.
    if (!previous) {
      result = await syncBrevoContactWithJournal(target, {
        ...options, createBlacklisted: true, readPerson, journal: await createBrevoContactJournal(),
      });
      if (result.status !== "created" && result.status !== "skipped") return fail(result.status);
    }
    const expectedId = previous?.provider_contact_id ?? (result && "contactId" in result ? result.contactId : undefined);
    if (typeof expectedId !== "number" || !Number.isSafeInteger(expectedId) || expectedId <= 0) return fail("verification_required");
    const checked = await ensureBrevoPilotChannels({ ...options, externalId: `atlas:${tenantId}:${brevoPilotPersonId}`,
      contactId: expectedId, email, authorize: async () => { await readPerson(target); } });
    if (checked.status !== "verified") return fail("channels_unconfirmed");
    return { status: result?.status === "created" ? "created_verified" : "existing_verified", contactId: checked.contactId };
  } catch { return fail("unavailable"); }
}
