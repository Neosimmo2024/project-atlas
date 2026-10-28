/**
 * VSC reply reconciliation audit data shape. No database writes.
 * Reduces sensitive data retained in logs and reports.
 */
export type VscReplyAudit = {
  tenantId: string;
  inspected: number;
  matched: number;
  recorded: number;
  timestamp: string;
  status: "dry_run" | "completed" | "failed";
};

export function buildVscReplyAudit(input: VscReplyAudit): VscReplyAudit {
  if (!input.tenantId || !Number.isSafeInteger(input.inspected) ||
      !Number.isSafeInteger(input.matched) || !Number.isSafeInteger(input.recorded) ||
      input.inspected < 0 || input.matched < 0 || input.recorded < 0 ||
      input.matched > input.inspected || input.recorded > input.matched ||
      Number.isNaN(Date.parse(input.timestamp))) throw new Error("Audit invalide");
  return { ...input, timestamp: new Date(input.timestamp).toISOString() };
}
