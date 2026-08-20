import { ApiError } from "@/lib/api-errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { RecruitmentEmailTemplateVersion, RecruitmentEmailTemplateVersionSummary, TenantContext } from "@/types/domain";
import type { RecruitmentEmailTemplateInput } from "@/features/recruitment-email-template/model";

function assertTemplateAdmin(context: TenantContext) {
  if (context.role !== "owner" && context.role !== "admin") {
    throw new ApiError("La gestion du modèle Brevo est réservée aux propriétaires et administrateurs.", 403, "FORBIDDEN");
  }
}

export async function listRecruitmentEmailTemplateVersions(context: TenantContext) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("recruitment_email_template_versions")
    .select("id, tenant_id, template_key, version_number, template_name, subject, preview_text, headline, body_text, signature_name, signature_title, sender_name, sender_email, reply_to, brand_color, status, brevo_template_id, last_sync_error, created_by, activated_by, activated_at, created_at, updated_at")
    .eq("tenant_id", context.tenantId)
    .eq("template_key", "initial_recruitment")
    .order("version_number", { ascending: false });
  if (error) throw error;
  return (data ?? []) as RecruitmentEmailTemplateVersionSummary[];
}

export async function getRecruitmentEmailTemplateVersion(context: TenantContext, versionId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("recruitment_email_template_versions")
    .select("*")
    .eq("tenant_id", context.tenantId)
    .eq("id", versionId)
    .maybeSingle();
  if (error) throw error;
  return (data as RecruitmentEmailTemplateVersion | null) ?? null;
}

export async function getActiveRecruitmentEmailTemplate(context: TenantContext) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("recruitment_email_template_versions")
    .select("*")
    .eq("tenant_id", context.tenantId)
    .eq("template_key", "initial_recruitment")
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  return (data as RecruitmentEmailTemplateVersion | null) ?? null;
}

export async function createRecruitmentEmailTemplateVersion(
  context: TenantContext,
  input: RecruitmentEmailTemplateInput,
  htmlContent: string
) {
  assertTemplateAdmin(context);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_recruitment_email_template_version", {
    p_tenant_id: context.tenantId,
    p_template_name: input.templateName,
    p_subject: input.subject,
    p_preview_text: input.previewText,
    p_headline: input.headline,
    p_body_text: input.bodyText,
    p_signature_name: input.signatureName,
    p_signature_title: input.signatureTitle,
    p_sender_name: input.senderName,
    p_sender_email: input.senderEmail,
    p_reply_to: input.replyTo || null,
    p_brand_color: input.brandColor,
    p_html_content: htmlContent
  });
  if (error) throw error;
  return data as RecruitmentEmailTemplateVersion;
}

export async function activateRecruitmentEmailTemplateVersion(context: TenantContext, versionId: string, brevoTemplateId: number) {
  assertTemplateAdmin(context);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("activate_recruitment_email_template_version", {
    p_version_id: versionId,
    p_brevo_template_id: brevoTemplateId
  });
  if (error) throw error;
  return data as RecruitmentEmailTemplateVersion;
}

export async function markRecruitmentEmailTemplateSyncError(context: TenantContext, versionId: string, message: string) {
  assertTemplateAdmin(context);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("mark_recruitment_email_template_sync_error", {
    p_version_id: versionId,
    p_error: message
  });
  if (error) throw error;
  return data as RecruitmentEmailTemplateVersion;
}
