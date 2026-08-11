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

function brevoConfiguration() {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const templateId = Number(process.env.BREVO_INITIAL_RECRUITMENT_TEMPLATE_ID);
  if (!apiKey || !Number.isInteger(templateId) || templateId <= 0) {
    return null;
  }
  return { apiKey, templateId };
}

export async function sendInitialRecruitmentEmail(input: {
  sequenceId: string;
  email: string;
  displayName: string;
}): Promise<BrevoSendResult> {
  const configuration = brevoConfiguration();
  if (!configuration) return { success: false, error: "Configuration Brevo incomplète." };

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": configuration.apiKey,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        templateId: configuration.templateId,
        to: [{ email: input.email, name: input.displayName }],
        params: { PRENOM: input.displayName.split(" ")[0] || input.displayName },
        headers: { "Idempotency-Key": input.sequenceId }
      }),
      cache: "no-store"
    });
    const body = await response.json().catch(() => ({})) as { messageId?: string; message?: string; code?: string };
    if (!response.ok || !body.messageId) {
      return { success: false, error: body.message || body.code || `Brevo HTTP ${response.status}` };
    }
    return { success: true, messageId: body.messageId };
  } catch {
    return { success: false, error: "Brevo est temporairement indisponible." };
  }
}
