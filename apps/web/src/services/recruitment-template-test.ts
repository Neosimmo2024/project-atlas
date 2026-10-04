import "server-only";
import { buildRecruitmentEmailHtml } from "@/features/recruitment-email-template/model";
import { personalizeTestTemplate, testEmailSchema } from "@/features/recruitment-email-template/test-email";
import type { z } from "zod";

// Intentionally independent of contacts, saved templates and recruitment sequences.
export async function sendRecruitmentTemplateTest(input: z.infer<typeof testEmailSchema>, tenantId: string) {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  if (!apiKey) return { success: false as const, error: "Configuration Brevo incomplète." };
  const template = personalizeTestTemplate(input.template, input.firstName);
  if ([template.subject, template.previewText, template.headline, template.bodyText].some(value => /{{|}}/.test(value))) {
    return { success: false as const, error: "Remplacez les variables inconnues avant d’envoyer le test. Seule la variable PRENOM est prise en charge." };
  }
  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { accept: "application/json", "api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        sender: { name: template.senderName, email: template.senderEmail },
        to: [{ email: input.recipient, name: input.firstName }],
        replyTo: template.replyTo ? { email: template.replyTo, name: template.senderName } : undefined,
        subject: `[TEST] ${template.subject}`,
        htmlContent: buildRecruitmentEmailHtml(template),
        tags: ["atlas-template-test"],
        headers: { "Idempotency-Key": `atlas-test-${tenantId}-${input.requestId}` }
      }),
      signal: AbortSignal.timeout(15000), cache: "no-store"
    });
    const body = await response.json().catch(() => ({})) as { messageId?: string };
    if (!response.ok || !body.messageId) return { success: false as const,
      error: "Brevo n’a pas confirmé l’envoi. Vérifiez le journal transactionnel avant de réessayer." };
    return { success: true as const, messageId: body.messageId };
  } catch {
    return { success: false as const, error: "Confirmation d’envoi indisponible. Vérifiez le journal Brevo avant de réessayer pour éviter un doublon." };
  }
}
