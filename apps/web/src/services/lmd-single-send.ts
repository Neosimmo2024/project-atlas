import "server-only";

export async function sendLmdSingleEmail(input: {
  requestId: string;
  recipient: string;
  recipientName: string;
  subject: string;
  textContent: string;
}) {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  if (!apiKey) return { success: false as const, error: "Configuration Brevo incomplète." };
  if (input.subject.includes("[TEST]") || input.textContent.includes("[TEST]")) {
    return { success: false as const, error: "Marqueur TEST interdit." };
  }
  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { accept: "application/json", "api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        sender: { name: "NEOS IMMO", email: "contact@neos-immo.com" },
        to: [{ email: input.recipient, name: input.recipientName }],
        subject: input.subject,
        textContent: input.textContent,
        tags: ["atlas-lmd-20261004"],
        headers: { "Idempotency-Key": input.requestId }
      }),
      signal: AbortSignal.timeout(15000),
      cache: "no-store"
    });
    const body = await response.json().catch(() => ({})) as { messageId?: string };
    if (!response.ok || !body.messageId) {
      return { success: false as const, error: "Brevo n’a pas confirmé l’envoi." };
    }
    return { success: true as const, messageId: body.messageId };
  } catch {
    return { success: false as const, error: "Confirmation Brevo indisponible." };
  }
}
