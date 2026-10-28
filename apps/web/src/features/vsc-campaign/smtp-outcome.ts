/** Conservative SMTP receipt interpretation. Never infer acceptance from messageId alone. */
export type VscSmtpOutcome = "sent" | "rejected" | "unknown";
function address(value: unknown): string | null {
  if (typeof value === "string") return value.trim().toLowerCase();
  if (value && typeof value === "object" && "address" in value && typeof value.address === "string") return value.address.trim().toLowerCase();
  return null;
}
export function classifyVscSmtpReceipt(value: unknown, recipient: string, messageId: string): VscSmtpOutcome {
  if (!value || typeof value !== "object") return "unknown";
  const info = value as Record<string, unknown>;
  return info.messageId === messageId && Array.isArray(info.accepted) && info.accepted.length === 1
    && address(info.accepted[0]) === recipient.trim().toLowerCase()
    && Array.isArray(info.rejected) && info.rejected.length === 0
    && typeof info.response === "string" && /^2\d\d(?:[ -]|$)/.test(info.response)
    ? "sent" : "unknown";
}
export function classifyVscSmtpError(value: unknown): VscSmtpOutcome {
  if (!value || typeof value !== "object") return "unknown";
  const error = value as Record<string, unknown>;
  const code = error.responseCode;
  // Only an explicit SMTP rejection at an envelope/DATA step proves non-acceptance.
  return ["EENVELOPE", "EMESSAGE"].includes(String(error.code))
    && ["MAIL FROM", "RCPT TO", "DATA"].includes(String(error.command).toUpperCase())
    && typeof code === "number" && Number.isInteger(code) && code >= 400 && code <= 599
    && typeof error.response === "string" && new RegExp(`^${code}(?:[ -]|$)`).test(error.response)
    ? "rejected" : "unknown";
}
