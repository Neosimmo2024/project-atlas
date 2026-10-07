import "server-only";
const sender = { name: "NEOS IMMO — Renato Ponzio", email: "renato.ponzio@neos-immo.com" };
export async function sendLmdSingleEmail(input: { requestId: string; recipient: string; recipientName: string; subject: string; textContent: string; scheduledAt?: string }) {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  if (!apiKey) return { success: false as const, error: "Configuration Brevo incomplète." };
  if (input.subject.includes("[TEST]") || input.textContent.includes("[TEST]")) return { success: false as const, error: "Marqueur TEST interdit." };
  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST", headers: { accept: "application/json", "api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({ sender, replyTo: sender, to: [{ email: input.recipient, name: input.recipientName }],
        subject: input.subject, textContent: input.textContent,
        ...(input.scheduledAt ? { scheduledAt: input.scheduledAt } : {}),
        tags: ["atlas-lmd-20261004"], headers: { "Idempotency-Key": input.requestId } }),
      signal: AbortSignal.timeout(15000), cache: "no-store"
    });
    const body = await response.json().catch(() => ({})) as { messageId?: string };
    if (!response.ok || !body.messageId) return { success: false as const, error: "Brevo n’a pas confirmé l’opération (HTTP " + response.status + ")." };
    return { success: true as const, messageId: body.messageId };
  } catch { return { success: false as const, error: "Confirmation Brevo indisponible : contrôle requis avant toute reprise." }; }
}
