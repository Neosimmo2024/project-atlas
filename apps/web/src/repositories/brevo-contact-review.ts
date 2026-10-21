import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { inspectConfiguredBrevoContactAttempt } from "./brevo-configured-contact-check";
import { getTenantContext } from "./tenant-context";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const closable = new Set(["linked_contact_observed_review_required", "suppression_observed_review_required"]);

/** Prepared server operation; no route, action or automatic caller.
 * Closes only the review with an explicit keep-blocked decision. A fresh account-
 * verified observation is required. Never claims the original write succeeded.
 */
export async function closeConfiguredBrevoContactReview(attemptId: string, confirmation: string) {
  const fail = (status: string) => ({ status, closed: false as const, retryAllowed: false as const });
  if (process.env.ATLAS_BREVO_CONTACT_REVIEW_ENABLED !== "1") return fail("disabled");
  if (confirmation !== "keep_blocked") return fail("confirmation_required");
  if (!uuid.test(attemptId)) return fail("invalid_identity");
  try {
    const actor = await getTenantContext();
    if (!actor || !["owner", "admin"].includes(actor.role)) return fail("unauthorized_attempt");
    const db = await createSupabaseServerClient();
    const { data: attempt, error } = await db.from("brevo_contact_sync_attempts")
      .select("id, tenant_id, status").eq("tenant_id", actor.tenantId).eq("id", attemptId).maybeSingle();
    if (error || !attempt || attempt.id !== attemptId || attempt.tenant_id !== actor.tenantId) return fail("unauthorized_attempt");
    if (attempt.status !== "write_outcome_unknown") return fail("attempt_not_reviewable");
    // Configured checks enforce QA scope, server tenant binding, account identity
    // and current permissions. No primitive accepting caller-supplied keys here.
    const observation = await inspectConfiguredBrevoContactAttempt(attemptId);
    if (!observation.recorded || !("checkId" in observation) || !uuid.test(observation.checkId)
      || !closable.has(observation.status)) return fail("review_evidence_unavailable");
    const current = await getTenantContext();
    if (!current || !["owner", "admin"].includes(current.role)
      || current.userId !== actor.userId || current.tenantId !== actor.tenantId) return fail("unauthorized_attempt");
    const { data: reviewId, error: writeError } = await createSupabaseServiceRoleClient().rpc("close_brevo_contact_review", {
      p_tenant_id: actor.tenantId, p_user_id: actor.userId, p_attempt_id: attemptId, p_check_id: observation.checkId,
    });
    if (writeError || typeof reviewId !== "string" || !uuid.test(reviewId)) return fail("review_unavailable");
    return { status: "review_closed_retry_blocked", closed: true as const, reviewId, retryAllowed: false as const };
  } catch { return fail("review_unavailable"); }
}
