import { createHash } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api-errors";
import { buildRecruitmentEmailHtml, DEFAULT_RECRUITMENT_EMAIL_TEMPLATE } from "@/features/recruitment-email-template/model";
import { isLocalSnapshot, localSnapshotSchema, LOCAL_CAMPAIGN_KEY, LOCAL_REVIEW_KEY, LOCAL_SENDER } from "@/features/recruitment-email/local-campaign";
import { createBrevoRecruitmentTemplate, verifyBrevoSender, verifyBrevoTemplate } from "@/services/brevo";

const text = z.string().min(20).max(10000);
const reviewSchema = z.object({
  campaign_key: z.literal(LOCAL_CAMPAIGN_KEY), approved_by_user: z.literal(true), approved_at: z.string().min(1),
  sender_email: z.literal(LOCAL_SENDER),
  batches: z.array(z.object({ person_ids: z.array(z.string().uuid()).min(1).max(40), proposed_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), proposed_time: z.literal("09:30"), timezone: z.literal("Europe/Paris") })).min(1),
  templates: z.tuple([
    z.object({ step: z.literal(1), delay_days: z.literal(0), subject: z.string().min(3), body_local: text, body_nearby: text }),
    z.object({ step: z.literal(2), delay_days: z.literal(10), subject: z.string().min(3), body: text }),
    z.object({ step: z.literal(3), delay_days: z.literal(20), subject: z.string().min(3), body: text })
  ])
});

export async function prepareLocalEmailCampaign(db: SupabaseClient, projectId: string) {
  const { data: project, error } = await db.from("projects").select("id,tenant_id,metadata,status,archived_at").eq("id", projectId).maybeSingle();
  if (error) throw error;
  const parsed = reviewSchema.safeParse(project?.metadata?.[LOCAL_REVIEW_KEY]);
  if (!project || !parsed.success || project.status !== "open" || project.archived_at) throw new ApiError("Dossier Saint-Maur validé requis.", 409, "LOCAL_APPROVAL_REQUIRED");
  const review = parsed.data;
  const recipientIds = review.batches.flatMap(b => b.person_ids);
  if (new Set(recipientIds).size !== recipientIds.length) throw new ApiError("Destinataires dupliqués.", 409, "LOCAL_DUPLICATES");
  const previous = project.metadata.local_recruitment_campaign;
  const bodies = [review.templates[0].body_local, review.templates[0].body_nearby, review.templates[1].body, review.templates[2].body];
  const subjects = [review.templates[0].subject, review.templates[0].subject, review.templates[1].subject, review.templates[2].subject];
  const html = bodies.map((body, i) => buildRecruitmentEmailHtml({ ...DEFAULT_RECRUITMENT_EMAIL_TEMPLATE,
    subject: subjects[i], headline: subjects[i], previewText: subjects[i], senderEmail: LOCAL_SENDER, replyTo: LOCAL_SENDER,
    bodyText: body.replaceAll("\\n", "\n").replaceAll("[Prénom]", "{{ params.PRENOM }}").replaceAll("[Ville]", "{{ params.VILLE }}") }));
  const contentHash = createHash("sha256").update(JSON.stringify({ html, subjects, sender: LOCAL_SENDER, recipientIds, batches: review.batches, approved_at: review.approved_at })).digest("hex");
  if (previous?.content_hash && previous.content_hash !== contentHash) throw new ApiError("Le dossier préparé a changé. Préparation bloquée.", 409, "LOCAL_APPROVAL_CHANGED");
  await verifyBrevoSender(LOCAL_SENDER);
  const templateIds: number[] = [...(previous?.template_ids ?? [])];
  for (let i = 0; i < 4; i++) {
    if (!templateIds[i]) {
      const result = await createBrevoRecruitmentTemplate({ templateName: `Saint-Maur 20261016 — ${["initial local", "initial proximité", "J10", "J20"][i]}`,
        subject: subjects[i], senderName: "NEOS IMMO", senderEmail: LOCAL_SENDER, replyTo: LOCAL_SENDER, htmlContent: html[i], tag: "atlas-saint-maur-local" });
      if (!result.success) throw new ApiError(result.error, 502, "BREVO_TEMPLATE_ERROR");
      templateIds[i] = result.templateId;
      const { error: saveError } = await db.from("projects").update({ metadata: { ...project.metadata,
        local_recruitment_campaign: { key: LOCAL_CAMPAIGN_KEY, content_hash: contentHash, template_ids: templateIds, state: "preparing" } } }).eq("id", projectId).eq("tenant_id", project.tenant_id);
      if (saveError) throw saveError;
    }
    await verifyBrevoTemplate(templateIds[i], { subject: subjects[i], sender_email: LOCAL_SENDER, reply_to: LOCAL_SENDER, html_content: html[i] });
  }
  const config = { key: LOCAL_CAMPAIGN_KEY, state: "ready", launch_enabled: false, sender_verified: true,
    template_ids: templateIds, content_hash: contentHash, recipient_ids: recipientIds, prepared_at: new Date().toISOString() };
  const { error: saveError } = await db.from("projects").update({ metadata: { ...project.metadata, local_recruitment_campaign: config } }).eq("id", projectId).eq("tenant_id", project.tenant_id);
  if (saveError) throw saveError;
  return config;
}

export async function resolveLocalCampaign(db: SupabaseClient, tenantId: string, personId: string, snapshot: unknown) {
  if (!isLocalSnapshot(snapshot)) return null;
  const pinned = localSnapshotSchema.safeParse(snapshot);
  if (!pinned.success) return { blocked: true as const };
  const { data, error } = await db.from("projects").select("metadata,status,archived_at").eq("tenant_id", tenantId).eq("id", pinned.data.project_id).maybeSingle();
  if (error) throw error;
  const config = data?.metadata?.local_recruitment_campaign;
  const standard = data?.metadata?.recruitment_email_campaign;
  const ids = config?.template_ids;
  if (!config || data?.status !== "open" || data.archived_at || config.state !== "ready" || config.launch_enabled !== true || !config.sender_verified
    || !standard?.launch_enabled || !config.recipient_ids?.includes(personId) || config.content_hash !== pinned.data.content_hash
    || !Array.isArray(ids) || ids.length !== 4 || ![ids[0], ids[1]].includes(pinned.data.template_ids[0])
    || ids[2] !== pinned.data.template_ids[1] || ids[3] !== pinned.data.template_ids[2]) return { blocked: true as const };
  return { blocked: false as const, snapshot: pinned.data };
}
