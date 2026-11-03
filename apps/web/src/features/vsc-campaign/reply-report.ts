/**
 * Explicitly preview-only report shape. No personal email addresses or
 * message headers leave the server in the admin response.
 */
export type VscReplyPreviewReport = {
  dryRun: true;
  inspected: number;
  matched: number;
  generatedAt: string;
};

export function createVscReplyPreviewReport(input: {
  inspected: number;
  matched: number;
  now: Date;
}): VscReplyPreviewReport {
  if (!Number.isSafeInteger(input.inspected) || input.inspected < 0 ||
      !Number.isSafeInteger(input.matched) || input.matched < 0 ||
      input.matched > input.inspected || Number.isNaN(input.now.getTime()))
    throw new Error("Résultat d'inspection invalide");
  return {
    dryRun: true,
    inspected: input.inspected,
    matched: input.matched,
    generatedAt: input.now.toISOString()
  };
}
