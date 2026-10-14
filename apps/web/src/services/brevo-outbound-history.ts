import "server-only";
import { createHash } from "node:crypto";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { verifyBrevoAccountBinding } from "./brevo-account-binding";
import { sentEvidence, uniquePersonForEmail } from "@/features/mailbox/brevo-history";
import { syncMarketingHistory } from "./brevo-marketing-history";
const tenant = "8e27b0ff-3f1a-41fa-8390-628c718723a2";
export async function syncBrevoOutboundHistory(tenantId: string) {
  if (tenantId !== tenant) return { imported: 0, unmatched: 0 };
  const db = createSupabaseServiceRoleClient();
  const apiKey = process.env.BREVO_API_KEY;
  const binding = await verifyBrevoAccountBinding(tenantId, { enabled: true, accountTenantId: tenant,
    expectedOrganizationId: "69aae9fea303e8f4220b4e98", apiKey });
  if (binding.status !== "verified") throw new Error("BREVO_HISTORY_ACCOUNT_UNVERIFIED");
  const index = new Map<string, string[]>();
  for (let offset = 0; ; offset += 1000) {
    const people = await db.from("people").select("id,primary_email").eq("tenant_id", tenantId)
      .not("primary_email", "is", null).order("id").range(offset, offset + 999);
    if (people.error) throw new Error("BREVO_HISTORY_PEOPLE_FAILED");
    for (const person of people.data ?? []) {
      const email = person.primary_email?.trim().toLowerCase();
      if (email) index.set(email, [...(index.get(email) ?? []), person.id]);
    }
    if ((people.data?.length ?? 0) < 1000) break;
  }
  let imported = 0, unmatched = 0;
  for (let offset = 0; ; offset += 1000) {
    const response = await fetch(`https://api.brevo.com/v3/smtp/statistics/events?days=90&event=delivered&limit=1000&offset=${offset}&sort=desc`, {
      headers: { "api-key": apiKey!, accept: "application/json" }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("BREVO_HISTORY_REPORT_FAILED");
    const report = await response.json() as { events?: Record<string, unknown>[] };
    if (!Array.isArray(report.events)) throw new Error("BREVO_HISTORY_REPORT_INVALID");
    const writes = [];
    for (const row of report.events) {
      const evidence = sentEvidence(row);
      if (!evidence) continue;
      const personId = uniquePersonForEmail(index, evidence.email);
      if (!personId) { unmatched++; continue; }
      const digest = createHash("sha256").update(`${evidence.messageId}|${evidence.email}`).digest("hex");
      writes.push({ tenant_id: tenantId, event_type: "recruitment_email_sent", title: "Email Brevo retrouvé dans l’historique",
        description: evidence.subject ?? evidence.tag ?? "Envoi confirmé par les logs Brevo", occurred_at: evidence.sentAt,
        created_by: null, person_id: personId, source_type: "person", source_id: personId, visibility: "tenant",
        idempotency_key: `brevo-outbound:${digest}`, metadata: { source: "brevo_outbound_journal", provider_message_id: evidence.messageId,
          recipient_email: evidence.email, sender_email: evidence.sender, campaign_name: evidence.tag ?? (evidence.email.endsWith("@lmdimmobilier.fr") ? "LMD" : "Brevo"), subject: evidence.subject } });
    }
    if (writes.length) {
      const saved = await db.from("timeline_events").upsert(writes, { onConflict: "tenant_id,idempotency_key", ignoreDuplicates: true }).select("id");
      if (saved.error) throw new Error("BREVO_HISTORY_SAVE_FAILED");
      imported += saved.data?.length ?? 0;
    }
    if (report.events.length < 1000) break;
  }
  const marketing = await syncMarketingHistory(tenantId, index, apiKey!);
  const summary = await db.rpc("set_vault_secret_value", { p_name: `atlas_brevo_history_summary_${tenantId}`,
    p_value: JSON.stringify({ checked_at: new Date().toISOString(), unmatched_smtp_events: unmatched, marketing_pending: !marketing.done }),
    p_description: "Brevo reply coverage summary — no credentials" });
  if (summary.error) throw new Error("BREVO_HISTORY_SUMMARY_FAILED");
  return { imported, unmatched, marketing };
}
