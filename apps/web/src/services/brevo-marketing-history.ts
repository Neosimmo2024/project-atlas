import "server-only";
import { createHash } from "node:crypto";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { uniquePersonForEmail } from "@/features/mailbox/brevo-history";
type Progress = { signature: string; offset: number; done: boolean; imported: number; unmatched: number };
type Campaign = { id: number; name?: string; subject?: string; sentDate?: string; sender?: { email?: string }; replyTo?: string; recipients?: { lists?: number[]; segments?: number[] } };
/** Reads provider-confirmed campaign/contact send evidence. Does not send or edit Brevo contacts. */
export async function syncMarketingHistory(tenantId: string, index: Map<string, string[]>, apiKey: string) {
  const db = createSupabaseServiceRoleClient();
  const read = async (path: string) => {
    const response = await fetch(`https://api.brevo.com/v3/${path}`, { headers: { "api-key": apiKey, accept: "application/json" },
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
    if (!response.ok) {
      const phase = path.startsWith("contacts/lists/") ? "LIST" : path.includes("/campaignStats") ? "STATS" : path.startsWith("emailCampaigns") ? "CAMPAIGNS" : "CONTACTS";
      throw new Error(`BREVO_MARKETING_${phase}_HTTP_${response.status}`);
    }
    return response.json();
  };
  const campaigns: Campaign[] = [];
  for (let offset = 0; ; offset += 100) {
    const report = await read(`emailCampaigns?status=sent&limit=100&offset=${offset}&excludeHtmlContent=true`);
    if (!Array.isArray(report.campaigns)) throw new Error("BREVO_MARKETING_REPORT_INVALID");
    campaigns.push(...report.campaigns.filter((campaign: Campaign) => campaign.sender?.email?.toLowerCase().endsWith("@neos-immo.com")));
    if (report.campaigns.length < 100) break;
  }
  const signature = createHash("sha256").update(JSON.stringify(campaigns.map(c => [c.id, c.subject])) + new Date().toISOString().slice(0, 10)).digest("hex");
  const key = `atlas_brevo_marketing_progress_${tenantId}`;
  const stored = await db.rpc("get_vault_secret_value", { p_name: key });
  if (stored.error) throw new Error("BREVO_MARKETING_STATE_FAILED");
  const old = stored.data ? JSON.parse(String(stored.data)) as Progress : null;
  const state: Progress = old?.signature === signature ? old : { signature, offset: 0, done: false, imported: 0, unmatched: 0 };
  if (state.done) return state;
  const listIds = [...new Set(campaigns.flatMap(c => c.recipients?.lists ?? []))];
  let contacts: { contacts: { email?: string }[] };
  if (listIds.length && campaigns.every(c => c.recipients?.lists?.length && !c.recipients?.segments?.length)) {
    const listed = new Map<string, { email?: string }>();
    for (const listId of listIds) for (let offset = 0; ; offset += 500) {
      const report = await read(`contacts/lists/${listId}/contacts?limit=500&offset=${offset}&sort=asc`);
      if (!Array.isArray(report.contacts)) throw new Error("BREVO_MARKETING_LIST_INVALID");
      for (const contact of report.contacts) if (typeof contact.email === "string") listed.set(contact.email.toLowerCase(), contact);
      if (report.contacts.length < 500) break;
    }
    contacts = { contacts: [...listed.values()].slice(state.offset, state.offset + 50) };
  } else contacts = await read(`contacts?limit=50&offset=${state.offset}&sort=asc`);
  if (!Array.isArray(contacts.contacts)) throw new Error("BREVO_MARKETING_CONTACTS_INVALID");
  const targets = contacts.contacts.filter((contact): contact is { email: string } => typeof contact.email === "string" && Boolean(uniquePersonForEmail(index, contact.email)));
  const writes = [];
  for (let at = 0; at < targets.length; at += 5) {
    const batch = await Promise.allSettled(targets.slice(at, at + 5).map(async (contact: { email: string }) => {
      const email = contact.email.trim().toLowerCase();
      const stats = await read(`contacts/${encodeURIComponent(email)}/campaignStats`);
      return { email, sent: Array.isArray(stats.messagesSent) ? stats.messagesSent as { campaignId: number; eventTime: string }[] : [] };
    }));
    for (const result of batch) {
      if (result.status !== "fulfilled") throw result.reason instanceof Error ? result.reason : new Error("BREVO_MARKETING_BATCH_INCOMPLETE");
      for (const sent of result.value.sent) {
        const campaign = campaigns.find(c => c.id === sent.campaignId);
        if (!campaign?.subject || !Number.isFinite(Date.parse(sent.eventTime))) continue;
        const personId = uniquePersonForEmail(index, result.value.email)!;
        writes.push({ tenant_id: tenantId, event_type: "recruitment_email_sent", title: `Campagne Brevo : ${campaign.name ?? campaign.id}`,
          description: campaign.subject, occurred_at: sent.eventTime, created_by: null, person_id: personId,
          source_type: "person", source_id: personId, visibility: "tenant",
          idempotency_key: `brevo-marketing:${campaign.id}:${personId}:${Date.parse(sent.eventTime)}`,
          metadata: { source: "brevo_outbound_journal", channel: "brevo_marketing", provider_message_id: null,
            recipient_email: result.value.email, sender_email: campaign.sender?.email, campaign_id: campaign.id,
            campaign_name: campaign.name, subject: campaign.subject, sent_at: sent.eventTime, match_confidence: "recipient_subject_review" } });
      }
    }
  }
  if (writes.length) {
    const saved = await db.from("timeline_events").upsert(writes, { onConflict: "tenant_id,idempotency_key", ignoreDuplicates: true }).select("id");
    if (saved.error) throw new Error("BREVO_MARKETING_SAVE_FAILED");
    state.imported += saved.data?.length ?? 0;
  }
  state.unmatched += contacts.contacts.length - targets.length;
  state.offset += contacts.contacts.length;
  state.done = contacts.contacts.length < 50;
  const savedState = await db.rpc("set_vault_secret_value", { p_name: key, p_value: JSON.stringify(state), p_description: "Brevo campaign history cursor — no credentials" });
  if (savedState.error) throw new Error("BREVO_MARKETING_STATE_FAILED");
  return state;
}
