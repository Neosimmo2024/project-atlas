import type { ParsedMail } from "mailparser";

export function mailboxUidBatch(found: number[], cursor: number) {
  const pending = [...new Set(found.filter(uid => uid > cursor))].sort((a, b) => a - b);
  const history = pending.slice(0, 500);
  const historyIds = new Set(history);
  const recent = pending.slice(-20).filter(uid => !historyIds.has(uid));
  // Inspect recent replies first while preserving the history cursor.
  return { uids: [...recent, ...history], historyIds };
}

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

export function trackedReplyReference(references: string[], trackedIds: Set<string>) {
  return references.find(reference => messageIdVariants(reference).some(value => trackedIds.has(value))) ?? null;
}
