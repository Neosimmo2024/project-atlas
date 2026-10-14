import "server-only";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { verifyBrevoAccountBinding } from "./brevo-account-binding";

const tenant = "8e27b0ff-3f1a-41fa-8390-628c718723a2";
const recipient = "33661558750";
const origin = "https://project-atlas-qa-beta-1.vercel.app";

export function replySmsContent(personId: string, name: string) {
  if (!/^[0-9a-f-]{36}$/i.test(personId)) throw new Error("INVALID_PERSON");
  const label = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9 .'-]/g, "").slice(0, 22);
  return `Atlas: reponse de ${label || "votre contact"}. A verifier: ${origin}/people/${personId}#replies`;
}

/** Durable compare-and-swap claim before sending. An ambiguous POST is never retried. */
export async function dispatchReplySmsAlerts(tenantId: string) {
  if (tenantId !== tenant) return;
  const db = createSupabaseServiceRoleClient();
  const config = await db.rpc("get_vault_secret_value", { p_name: "atlas_reply_sms_enabled" });
  if (config.error || config.data !== "true") return;
  const apiKey = process.env.BREVO_API_KEY;
  const verified = await verifyBrevoAccountBinding(tenantId, { enabled: true,
    accountTenantId: tenant, expectedOrganizationId: "69aae9fea303e8f4220b4e98", apiKey });
  if (verified.status !== "verified") throw new Error("SMS_ACCOUNT_UNVERIFIED");
  const pending = await db.from("tasks").select("id,person_id,metadata")
    .eq("tenant_id", tenantId).is("deleted_at", null)
    .contains("metadata", { source: "recruitment_candidate_reply", sms_alert_status: "pending" })
    .order("created_at").limit(10);
  if (pending.error) throw new Error("SMS_OUTBOX_UNAVAILABLE");
  for (const task of pending.data ?? []) {
    const person = await db.from("people").select("display_name").eq("tenant_id", tenantId).eq("id", task.person_id).maybeSingle();
    if (person.error || !person.data) continue;
    const content = replySmsContent(task.person_id, person.data.display_name);
    const metadata = { ...task.metadata, sms_alert_status: "processing", sms_claimed_at: new Date().toISOString() };
    const claim = await db.from("tasks").update({ metadata }).eq("tenant_id", tenantId).eq("id", task.id)
      .contains("metadata", { sms_alert_status: "pending" }).select("id").maybeSingle();
    if (claim.error) throw new Error("SMS_CLAIM_FAILED");
    if (!claim.data) continue;
    let status = "unknown";
    let messageId: string | null = null;
    try {
      const response = await fetch("https://api.brevo.com/v3/transactionalSMS/send", {
        method: "POST", headers: { "api-key": apiKey!, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ sender: "NEOSIMMO", recipient, content, type: "transactional", unicodeEnabled: false, tag: `atlas-reply-${task.id}` }),
        redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000)
      });
      if (response.status === 201) {
        const result = await response.json() as { messageId?: string | number };
        if (result.messageId) { status = "accepted"; messageId = String(result.messageId); }
      } else if ([400, 401, 402, 403, 422, 429].includes(response.status)) status = "rejected";
    } catch { /* Keep unknown; never retry a potentially accepted SMS. */ }
    const saved = await db.from("tasks").update({ metadata: { ...metadata, sms_alert_status: status,
      sms_provider_message_id: messageId, sms_completed_at: new Date().toISOString() } }).eq("tenant_id", tenantId).eq("id", task.id);
    if (saved.error) throw new Error("SMS_RESULT_NOT_SAVED");
  }
}
