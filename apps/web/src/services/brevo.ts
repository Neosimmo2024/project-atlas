import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

type BrevoSendResult = { success: true; messageId: string } | { success: false; error: string };

export type BrevoContactPayload = {
  tenantId: string;
  personId: string;
  email?: string | null;
  phone?: string | null;
};

export async function prepareBrevoContact(_payload: BrevoContactPayload) {
  void _payload;
  return { prepared: true, sent: false, reason: "Brevo automations are intentionally out of scope for this ticket." };
}

function brevoApiKey() {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  return apiKey || null;
}

function recruitmentReplyAddress(sequenceId: string) {
  const domain = process.env.BREVO_RECRUITMENT_INBOUND_DOMAIN?.trim().toLowerCase();
  return domain ? `recrutement+${sequenceId}@${domain}` : null;
}

async function recruitmentReplyAddressForStep(stepId: string) {
  const domain = process.env.BREVO_RECRUITMENT_INBOUND_DOMAIN?.trim().toLowerCase();
  if (!domain) return null;
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("recruitment_email_sequence_steps")
    .select("sequence_id")
    .eq("id", stepId)
    .maybeSingle();
  if (error || !data?.sequence_id) return null;
  return `recrutement+${data.sequence_id as string}@${domain}`;
}

function brevoConfiguration(templateOverride?: number | null) {
  const apiKey = brevoApiKey();
  const override = Number(templateOverride);
  const templateId = Number(process.env.BREVO_INITIAL_RECRUITMENT_TEMPLATE_ID);
  const selectedTemplateId = Number.isInteger(override) && override > 0 ? override : templateId;
  if (!apiKey || !Number.isInteger(selectedTemplateId) || selectedTemplateId <= 0) return null;
  return { apiKey, templateId: selectedTemplateId };
}

async function brevoFollowUpConfiguration(stepIndex: 1 | 2) {
  const apiKey = brevoApiKey();
  if (!apiKey) return null;
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.rpc("get_recruitment_follow_up_template_id", { p_step_index: stepIndex });
  if (error) return null;
  const templateId = Number(data);
  if (!Number.isInteger(templateId) || templateId <= 0) return null;
  return { apiKey, templateId };
}

async function sendBrevoTemplateEmail(input: {
  apiKey: string;
  templateId: number;
  idempotencyKey: string;
  email: string;
  displayName: string;
  replyTo?: string | null;
}): Promise<BrevoSendResult> {
  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { accept: "application/json", "api-key": input.apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        templateId: input.templateId,
        to: [{ email: input.email, name: input.displayName }],
        replyTo: input.replyTo ? { email: input.replyTo, name: "NEOS IMMO" } : undefined,
        params: { PRENOM: input.displayName.split(" ")[0] || input.displayName },
        headers: { "Idempotency-Key": input.idempotencyKey }
      }),
      cache: "no-store"
    });
    const body = await response.json().catch(() => ({})) as { messageId?: string; message?: string; code?: string };
    if (!response.ok || !body.messageId) return { success: false, error: body.message || body.code || `Brevo HTTP ${response.status}` };
    return { success: true, messageId: body.messageId };
  } catch {
    return { success: false, error: "Brevo est temporairement indisponible." };
  }
}

export type BrevoTemplatePayload = {
  templateName: string;
  subject: string;
  senderName: string;
  senderEmail: string;
  replyTo?: string | null;
  htmlContent: string;
  tag?: string;
};

export async function createBrevoRecruitmentTemplate(payload: BrevoTemplatePayload) {
  const apiKey = brevoApiKey();
  if (!apiKey) return { success: false as const, error: "Configuration Brevo incomplète." };
  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/templates", {
      method: "POST",
      headers: { accept: "application/json", "api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        templateName: payload.templateName,
        subject: payload.subject,
        sender: { name: payload.senderName, email: payload.senderEmail },
        replyTo: payload.replyTo || undefined,
        htmlContent: payload.htmlContent,
        isActive: true,
        tag: payload.tag || "avenor-initial-recruitment"
      }),
      cache: "no-store"
    });
    const body = await response.json().catch(() => ({})) as { id?: number; message?: string; code?: string };
    if (!response.ok || !Number.isInteger(body.id) || Number(body.id) <= 0) {
      return { success: false as const, error: body.message || body.code || `Brevo HTTP ${response.status}` };
    }
    return { success: true as const, templateId: Number(body.id) };
  } catch {
    return { success: false as const, error: "Brevo est temporairement indisponible." };
  }
}

export async function sendInitialRecruitmentEmail(input: {
  sequenceId: string;
  email: string;
  displayName: string;
  templateId?: number | null;
}): Promise<BrevoSendResult> {
  const configuration = brevoConfiguration(input.templateId);
  if (!configuration) return { success: false, error: "Configuration Brevo incomplète." };
  return sendBrevoTemplateEmail({
    ...configuration,
    idempotencyKey: input.sequenceId,
    email: input.email,
    displayName: input.displayName,
    replyTo: recruitmentReplyAddress(input.sequenceId)
  });
}

export async function sendRecruitmentFollowUpEmail(input: {
  stepId: string;
  stepIndex: 1 | 2;
  email: string;
  displayName: string;
}): Promise<BrevoSendResult> {
  const configuration = await brevoFollowUpConfiguration(input.stepIndex);
  if (!configuration) return { success: false, error: `Configuration Brevo relance ${input.stepIndex} incomplète.` };
  return sendBrevoTemplateEmail({
    ...configuration,
    idempotencyKey: input.stepId,
    email: input.email,
    displayName: input.displayName,
    replyTo: await recruitmentReplyAddressForStep(input.stepId)
  });
}
