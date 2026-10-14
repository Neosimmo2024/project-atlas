export type SentEvidence = { email: string; messageId: string; sentAt: string; sender: string; tag: string | null; subject: string | null };
export function sentEvidence(row: Record<string, unknown>): SentEvidence | null {
  const email = String(row.email ?? "").trim().toLowerCase();
  const sender = String(row.from ?? "").trim().toLowerCase();
  const messageId = String(row.messageId ?? "").trim();
  const date = Date.parse(String(row.date ?? ""));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !sender.endsWith("@neos-immo.com")
    || !/^[^\r\n\s]{3,500}$/.test(messageId) || !Number.isFinite(date)
    || !["delivered", "requests"].includes(String(row.event))) return null;
  return { email, sender, messageId, sentAt: new Date(date).toISOString(),
    tag: typeof row.tag === "string" ? row.tag.slice(0, 200) : null,
    subject: typeof row.subject === "string" ? row.subject.slice(0, 250) : null };
}
export function uniquePersonForEmail(index: Map<string, string[]>, email: string) {
  const ids = index.get(email.trim().toLowerCase()) ?? [];
  return ids.length === 1 ? ids[0] : null;
}
