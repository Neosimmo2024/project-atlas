import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api-errors";
import { lyonCampaignSchema, lyonSnapshotSchema, canLaunchLyon, isLyonCampaignReady, LYON_SENDER, type LyonSnapshot } from "@/features/recruitment-email/lyon-campaign";
import { isLyonRecruitmentProfile } from "@/features/recruitment-email/campaign-policy";
import { createBrevoRecruitmentTemplate, verifyBrevoSender, verifyBrevoTemplate } from "@/services/brevo";
import type { RecruitmentEmailTemplateVersion } from "@/types/domain";

export async function getLyonCampaignForPerson(db: SupabaseClient, tenantId: string, personId: string) {
  const { data, error } = await db.from("projects").select("id,metadata")
    .eq("tenant_id", tenantId).contains("metadata", { lyon_development: { person_ids: [personId] } }).maybeSingle();
  if (error) throw error;
  const parsed = lyonCampaignSchema.safeParse(data?.metadata?.recruitment_email_campaign);
  return data && parsed.success ? { projectId: data.id as string, campaign: parsed.data } : null;
}

export async function prepareLyonEmailCampaign(db: SupabaseClient, tenantId: string, projectId: string, versionDb: SupabaseClient = db) {
  const { data: project, error } = await db.from("projects").select("id,metadata")
    .eq("tenant_id", tenantId).eq("id", projectId).maybeSingle();
  if (error) throw error;
  const parsed = lyonCampaignSchema.safeParse(project?.metadata?.recruitment_email_campaign);
  if (!project?.metadata?.lyon_development || !parsed.success) throw new ApiError("Configuration Lyon à compléter.", 409, "CAMPAIGN_NOT_READY");
  const campaign = parsed.data;
  if (campaign.launch_enabled) throw new ApiError("Arrêtez le lancement avant de préparer d’autres modèles.", 409, "CAMPAIGN_RUNNING");
  const { data: versions, error: versionError } = await versionDb.from("recruitment_email_template_versions").select("*")
    .eq("tenant_id", tenantId).in("id", campaign.version_ids);
  if (versionError) throw versionError;
  const ordered = campaign.version_ids.map(id => (versions as RecruitmentEmailTemplateVersion[] | null)?.find(v => v.id === id));
  if (ordered.some(v => !v || !v.template_name.startsWith("Lyon") || v.sender_email !== LYON_SENDER || v.reply_to !== LYON_SENDER)) {
    throw new ApiError("Les trois versions Lyon doivent utiliser l’expéditeur et l’adresse de réponse Renato.", 409, "INVALID_CAMPAIGN_TEMPLATES");
  }
  if (new Set(campaign.version_ids).size !== 3) throw new ApiError("Trois versions distinctes sont nécessaires.", 409, "INVALID_CAMPAIGN_TEMPLATES");
  const personIds: string[] = project.metadata.lyon_development.person_ids ?? [];
  if (campaign.recipient_ids.some(id => !personIds.includes(id))) throw new ApiError("Un destinataire n’appartient pas au projet Lyon.", 409, "INVALID_RECIPIENTS");
  const { data: people, error: peopleError } = await db.from("people").select("id,primary_email,do_not_contact,comments")
    .eq("tenant_id", tenantId).in("id", campaign.recipient_ids);
  if (peopleError) throw peopleError;
  if (people?.length !== campaign.recipient_ids.length || people.some(p => !p.primary_email || p.do_not_contact || !isLyonRecruitmentProfile(p.comments))) {
    throw new ApiError("Vérifiez les adresses et les restrictions des destinataires Lyon.", 409, "INVALID_RECIPIENTS");
  }
  await verifyBrevoSender(LYON_SENDER);
  const templateIds: number[] = [...(campaign.template_ids ?? campaign.pending_template_ids ?? [])];
  for (let index = 0; index < 3; index++) {
    const version = ordered[index]!;
    if (!templateIds[index]) {
      const result = await createBrevoRecruitmentTemplate({ templateName: `${version.template_name} — v${version.version_number}`,
        subject: version.subject, senderName: version.sender_name, senderEmail: version.sender_email,
        replyTo: version.reply_to, htmlContent: version.html_content, tag: "atlas-lyon-development" });
      if (!result.success) throw new ApiError(result.error, 502, "BREVO_TEMPLATE_ERROR");
      templateIds[index] = result.templateId;
      // Persist progress before verification so a retry reuses the same draft templates.
      const { error: progressError } = await db.from("projects").update({ metadata: { ...project.metadata,
        recruitment_email_campaign: { ...campaign, pending_template_ids: [...templateIds] } } })
        .eq("tenant_id", tenantId).eq("id", projectId);
      if (progressError) throw progressError;
    }
    await verifyBrevoTemplate(templateIds[index], version);
  }
  const ready = lyonCampaignSchema.parse({ ...campaign, state: "ready", launch_enabled: false,
    template_ids: templateIds, sender_verified: true, prepared_at: new Date().toISOString() });
  const { error: updateError } = await db.from("projects").update({ metadata: { ...project.metadata, recruitment_email_campaign: ready } })
    .eq("tenant_id", tenantId).eq("id", projectId);
  if (updateError) throw updateError;
  // Deliberately does not activate the national version, authorize contacts,
  // create sequences, schedule steps, or call an email sending endpoint.
  return ready;
}

export async function resolveLyonFollowUp(db: SupabaseClient, tenantId: string, personId: string, comments: string | null | undefined, snapshot: unknown) {
  if (!snapshot && !isLyonRecruitmentProfile(comments)) return null;
  const parsed = lyonSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) return { blocked: true as const };
  const pinned: LyonSnapshot = parsed.data;
  const { data, error } = await db.from("projects").select("metadata").eq("tenant_id", tenantId).eq("id", pinned.project_id).maybeSingle();
  if (error) throw error;
  const config = lyonCampaignSchema.safeParse(data?.metadata?.recruitment_email_campaign);
  if (!config.success || !isLyonCampaignReady(config.data) || !canLaunchLyon(config.data, personId)) return { blocked: true as const };
  if (JSON.stringify(config.data.version_ids) !== JSON.stringify(pinned.version_ids)
    || JSON.stringify(config.data.template_ids) !== JSON.stringify(pinned.template_ids)) return { blocked: true as const };
  return { blocked: false as const, snapshot: pinned };
}
