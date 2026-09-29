import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ContactSyncJournal } from "@/services/brevo-contact-journal";
import { getTenantContext } from "./tenant-context";

const unavailable = () => new Error("BREVO_CONTACT_JOURNAL_UNAVAILABLE");
const reasons = new Set(["invalid_identity", "tenant_mismatch", "missing_configuration", "invalid_email",
  "invalid_contact", "identity_conflict", "email_change_requires_review", "contact_not_allowed", "already_linked",
  "already_blocklisted", "email_collision", "source_changed", "source_or_lookup_failed", "provider_rejected", "reconcile_before_retry"]);

export async function createBrevoContactJournal(): Promise<ContactSyncJournal> {
  async function context() {
    const value = await getTenantContext();
    if (!value || !["owner", "admin"].includes(value.role)) throw unavailable();
    return value;
  }
  let actor: Awaited<ReturnType<typeof context>>;
  try { actor = await context(); } catch { throw unavailable(); }
  const tenantId = actor.tenantId;
  const userId = actor.userId;
  async function client() {
    const fresh = await context();
    if (fresh.tenantId !== tenantId || fresh.userId !== userId) throw unavailable();
    return createSupabaseServerClient();
  }
  return {
    async begin(target) {
      try {
        if (target.tenantId !== tenantId) throw unavailable();
        const db = await client();
        const { data, error } = await db.from("brevo_contact_sync_attempts")
          .insert({ tenant_id: tenantId, user_id: userId, person_id: target.personId })
          .select("id").single();
        if (error || !data?.id) throw unavailable();
        return data.id as string;
      } catch { throw unavailable(); }
    },
    async finish(attemptId, result) {
      try {
        if (!["created", "suppressed", "blocked", "skipped", "failed", "write_outcome_unknown"].includes(result.status)) throw unavailable();
        const success = result.status === "created" || result.status === "suppressed";
        const contactId = "contactId" in result ? result.contactId : undefined;
        if (success && (typeof contactId !== "number" || !Number.isSafeInteger(contactId) || contactId <= 0)) throw unavailable();
        const reason = "reason" in result && reasons.has(result.reason) ? result.reason : "unclassified";
        const db = await client();
        const { data, error } = await db.from("brevo_contact_sync_attempts")
          .update({ status: result.status, result_code: success ? null : reason, provider_contact_id: success ? contactId : null })
          .eq("id", attemptId).eq("tenant_id", tenantId).eq("user_id", userId).eq("status", "pending")
          .select("id").single();
        if (error || data?.id !== attemptId) throw unavailable();
      } catch { throw unavailable(); }
    }
  };
}
