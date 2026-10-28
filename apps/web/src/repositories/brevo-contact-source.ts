import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ContactSyncInput } from "@/services/brevo-contact-plan";
import { getTenantContext } from "./tenant-context";

const identity = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const denied = () => new Error("BREVO_CONTACT_SOURCE_UNAVAILABLE");

/** Server-only source adapter. No route, environment flag or provider call activates it. */
export async function createAuthorizedBrevoContactSource(personId: string) {
  if (!identity.test(personId)) throw denied();
  async function authorizedContext() {
    try {
      const context = await getTenantContext();
      // Conservative initial scope: contact export is restricted to administrators.
      if (!context || !["owner", "admin"].includes(context.role)) throw denied();
      return context;
    } catch {
      throw denied();
    }
  }
  const initial = await authorizedContext();
  const tenantId = initial.tenantId;
  const userId = initial.userId;
  const boundPersonId = personId.toLowerCase();
  const target = { tenantId, personId: boundPersonId };

  async function readPerson(requested: Pick<ContactSyncInput, "tenantId" | "personId">): Promise<ContactSyncInput | null> {
    if (requested.tenantId !== tenantId || requested.personId.toLowerCase() !== boundPersonId) throw denied();
    try {
      // No cached context: revocation or a session/tenant switch stops subsequent reads.
      const current = await authorizedContext();
      if (current.tenantId !== tenantId || current.userId !== userId) throw denied();
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase.from("people")
        .select("id, tenant_id, primary_email, contact_allowed, do_not_contact")
        .eq("tenant_id", tenantId).eq("id", boundPersonId).maybeSingle();
      if (error) throw denied();
      if (!data) return null;
      if (data.tenant_id !== tenantId || data.id !== boundPersonId
        || typeof data.contact_allowed !== "boolean" || typeof data.do_not_contact !== "boolean"
        || (data.primary_email !== null && typeof data.primary_email !== "string")) throw denied();
      return { tenantId, personId: boundPersonId, email: data.primary_email,
        contactAllowed: data.contact_allowed, doNotContact: data.do_not_contact };
    } catch {
      throw denied();
    }
  }
  return { target, readPerson };
}
