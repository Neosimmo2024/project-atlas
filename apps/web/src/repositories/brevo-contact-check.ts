import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { inspectAuthorizedBrevoContactAttempt } from "./brevo-contact-reconciliation";
import { getTenantContext } from "./tenant-context";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const outcomes = new Set([
  "outcome_unresolved", "identity_or_state_unverified", "source_changed", "suppression_required",
  "suppression_observed_review_required", "email_change_requires_review",
  "linked_contact_observed_review_required", "verification_failed",
]);

/** Trusted server entry point; no route or activation. No write to Brevo or unlock.
 * Audit failure is not success: never claim a verification has been recorded.
 */
export async function inspectAndRecordBrevoContactAttempt(attemptId: string,
  options: Parameters<typeof inspectAuthorizedBrevoContactAttempt>[1]) {
  const fail = (status: string) => ({ status, recorded: false as const, retryAllowed: false as const });
  if (options.enabled !== true) return fail("disabled");
  if (!uuid.test(attemptId) || !uuid.test(options.accountTenantId)) return fail("invalid_identity");
  try {
    const actor = await getTenantContext();
    if (!actor || !["owner", "admin"].includes(actor.role)
      || actor.tenantId.toLowerCase() !== options.accountTenantId.toLowerCase()) return fail("unauthorized_attempt");
    const db = await createSupabaseServerClient();
    const { data: attempt, error } = await db.from("brevo_contact_sync_attempts")
      .select("id, tenant_id, status").eq("tenant_id", actor.tenantId).eq("id", attemptId).maybeSingle();
    if (error || !attempt || attempt.id !== attemptId || attempt.tenant_id !== actor.tenantId) return fail("unauthorized_attempt");
    if (!["pending", "write_outcome_unknown"].includes(attempt.status)) return fail("attempt_already_final");
    const result = await inspectAuthorizedBrevoContactAttempt(attemptId, options);
    if (!outcomes.has(result.status)) return fail(result.status);
    const fresh = await getTenantContext();
    if (!fresh || !["owner", "admin"].includes(fresh.role)
      || fresh.tenantId !== actor.tenantId || fresh.userId !== actor.userId) return fail("unauthorized_attempt");
    const server = createSupabaseServiceRoleClient();
    // Database rechecks membership and attempt state atomically before inserting.
    const { data: checkId, error: writeError } = await server.rpc("record_brevo_contact_check", {
      p_tenant_id: actor.tenantId, p_user_id: actor.userId, p_attempt_id: attemptId,
      p_attempt_status: attempt.status, p_outcome: result.status,
    });
    if (writeError || typeof checkId !== "string" || !uuid.test(checkId)) return fail("audit_unavailable");
    return { status: result.status, recorded: true as const, checkId, retryAllowed: false as const };
  } catch { return fail("audit_unavailable"); }
}
