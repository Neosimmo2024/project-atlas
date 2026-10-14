import type { ParsedMail } from "mailparser";

export function replyReferences(mail: Pick<ParsedMail, "inReplyTo" | "references" | "headers">): string[] {
  const auto = String(mail.headers.get("auto-submitted") ?? "no").toLowerCase();
  if (auto !== "no" || /^(bulk|list|junk)$/i.test(String(mail.headers.get("precedence") ?? ""))) return [];
  const refs = typeof mail.references === "string" ? [mail.references] : mail.references ?? [];
  return [...new Set([mail.inReplyTo, ...refs.slice().reverse()].filter((x): x is string => Boolean(x)))].slice(0, 30);
}

export function messageIdVariants(value: string) {
  const bare = value.trim().replace(/^<|>$/g, "");
  return [...new Set([value.trim(), bare, `<${bare}>`])];
}
