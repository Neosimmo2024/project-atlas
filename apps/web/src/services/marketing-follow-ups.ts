import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isMarketingSnapshot, marketingSnapshotSchema } from "@/features/recruitment-email/marketing-follow-ups";
import { createBrevoRecruitmentTemplate, verifyBrevoSender, verifyBrevoTemplate } from "./brevo";

const sender = "renato.ponzio@neos-immo.com";
async function readBrevo(path: string) {
  const key = process.env.BREVO_API_KEY;
  if (!key) throw new Error("BREVO_CONFIGURATION_MISSING");
  const response = await fetch(`https://api.brevo.com/v3/${path}`, { headers: { "api-key": key, accept: "application/json" }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`BREVO_FOLLOW_UP_READ_${response.status}`);
  return response.json();
}

export async function resolveMarketingFollowUp(db: SupabaseClient, tenantId: string, personId: string, snapshot: unknown) {
  if (!isMarketingSnapshot(snapshot)) return null;
  const parsed = marketingSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) return { blocked: true as const };
  const { data, error } = await db.from("projects").select("metadata,status,archived_at").eq("tenant_id", tenantId).eq("id", parsed.data.project_id).maybeSingle();
  if (error) throw error;
  const config = data?.metadata?.recruitment_email_campaign;
  if (data?.status !== "open" || data.archived_at || config?.state !== "ready" || !config.launch_enabled || !config.sender_verified
    || !config.recipient_ids?.includes(personId) || JSON.stringify(config.template_ids) !== JSON.stringify(parsed.data.template_ids)) return { blocked: true as const };
  const person = await db.from("people").select("primary_email").eq("tenant_id", tenantId).eq("id", personId).single();
  if (person.error) throw person.error;
  const contact = await readBrevo(`contacts/${encodeURIComponent(person.data.primary_email)}`);
  // Marketing opt-outs must also block a follow-up transported through SMTP.
  if (contact.emailBlacklisted || contact.smtpBlacklistSender?.length) return { blocked: true as const };
  return { blocked: false as const, snapshot: parsed.data };
}

/** Only enroll confirmed first sends. Never resend an initial email or revive a stopped sequence. */
export async function reconcileMarketingFollowUps(db: SupabaseClient) {
  const projects = await db.from("projects").select("id,tenant_id,metadata,created_by").eq("status", "open").is("archived_at", null)
    .contains("metadata", { marketing_follow_up_campaign: { key: "bordeaux-marketing-20261023", enabled: true } });
  if (projects.error) throw projects.error;
  for (const project of projects.data ?? []) {
    const config = project.metadata.marketing_follow_up_campaign;
    let ready = project.metadata.recruitment_email_campaign;
    if (!ready || ready.state !== "ready") {
      // Claim preparation before creating provider templates. An uncertain write requires review.
      const claimed = await db.from("projects").update({ metadata: { ...project.metadata, marketing_follow_up_campaign: { ...config, state: "preparing" } } })
        .eq("id", project.id).eq("metadata->marketing_follow_up_campaign->>state", "approved").select("id");
      if (claimed.error) throw claimed.error;
      if (!claimed.data?.length) continue;
      await verifyBrevoSender(sender);
      const ids: number[] = [];
      for (const id of config.follow_up_campaign_ids as number[]) {
        const campaign = await readBrevo(`emailCampaigns/${id}`);
        if (campaign.sender?.email !== sender || !campaign.name?.includes("Bordeaux") || !campaign.htmlContent?.includes("{{ unsubscribe }}")) throw new Error("BORDEAUX_APPROVED_CONTENT_INVALID");
        const html = campaign.htmlContent.replaceAll("{{ contact.PRENOM }}", "{{ params.PRENOM }}");
        const result = await createBrevoRecruitmentTemplate({ templateName: `${campaign.name} — suivi Atlas`, subject: campaign.subject,
          senderName: campaign.sender.name, senderEmail: sender, replyTo: sender, htmlContent: html, tag: "atlas-bordeaux-follow-up" });
        if (!result.success) throw new Error("BORDEAUX_TEMPLATE_PREPARATION_FAILED");
        ids.push(result.templateId);
        await verifyBrevoTemplate(result.templateId, { subject: campaign.subject, sender_email: sender, reply_to: sender, html_content: html });
      }
      if (ids.length !== 2) throw new Error("BORDEAUX_TWO_FOLLOW_UPS_REQUIRED");
      ready = { scope: "targeted", state: "ready", launch_enabled: true, sender_verified: true, recipient_ids: config.recipient_ids,
        template_ids: [ids[0], ...ids], prepared_at: new Date().toISOString() };
      const saved = await db.from("projects").update({ metadata: { ...project.metadata, recruitment_email_campaign: ready,
        marketing_follow_up_campaign: { ...config, state: "ready" } } }).eq("id", project.id);
      if (saved.error) throw saved.error;
    }
    if (!ready.launch_enabled) continue;
    const events = await db.from("timeline_events").select("id,person_id,occurred_at,metadata").eq("tenant_id", project.tenant_id)
      .contains("metadata", { source: "brevo_outbound_journal", channel: "brevo_marketing" }).in("metadata->>campaign_id", config.initial_campaign_ids.map(String)).order("occurred_at");
    if (events.error) throw events.error;
    for (const event of events.data ?? []) {
      if (!ready.recipient_ids.includes(event.person_id)) continue;
      const old = await db.from("recruitment_email_sequences").select("id").eq("tenant_id", project.tenant_id).eq("person_id", event.person_id).maybeSingle();
      if (old.error) throw old.error;
      if (old.data) continue;
      const person = await db.from("people").select("id,primary_email,first_name,contact_allowed,do_not_contact,status").eq("tenant_id", project.tenant_id).eq("id", event.person_id).single();
      if (person.error) throw person.error;
      if (!person.data.contact_allowed || person.data.do_not_contact || person.data.status === "archived" || person.data.primary_email?.trim().toLowerCase() !== event.metadata.recipient_email) continue;
      const replies = await db.from("tasks").select("id").eq("tenant_id", project.tenant_id).eq("person_id", event.person_id).contains("metadata", { source: "recruitment_candidate_reply" }).limit(1);
      if (replies.error) throw replies.error;
      if (replies.data?.length) continue;
      const created = await db.from("recruitment_email_sequences").insert({ tenant_id: project.tenant_id, person_id: event.person_id,
        email: event.metadata.recipient_email, status: "sent", lifecycle_status: "idle", sent_at: event.occurred_at, created_by: project.created_by, updated_by: project.created_by,
        campaign_snapshot: { key: config.key, project_id: project.id, template_ids: ready.template_ids, days: [0,15,30], first_name: person.data.first_name || "" } }).select("id").single();
      if (created.error?.code === "23505") continue;
      if (created.error) throw created.error;
      const linked = await db.from("timeline_events").update({ metadata: { ...event.metadata, sequence_id: created.data.id, project_id: project.id } }).eq("id", event.id);
      if (linked.error) throw linked.error;
    }
  }
}
