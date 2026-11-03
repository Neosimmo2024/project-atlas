/** VSC-only reply worker, callable manually or by the gated scheduler entry point. Never sends email or SMS. */
import { matchVscReplyBatch } from "@/services/vsc-reply-reconciliation";
import { inspectVscInboxBatch } from "@/services/vsc-ovh-imap";
import { loadVscImapCursor, saveVscImapCursor } from "@/services/vsc-imap-cursor";
import { recordVerifiedVscReply } from "@/services/vsc-inbound-reply-journal";

export async function reconcileVscRepliesOnce(tenantId: string): Promise<{
  inspected: number; matched: number; recorded: number; hasMore: boolean;
}> {
  if (!tenantId || tenantId !== process.env.VSC_OVH_TENANT_ID?.trim()) throw new Error("Entreprise non autorisée");
  const cursor = await loadVscImapCursor(tenantId);
  const batch = await inspectVscInboxBatch(cursor);
  const matches = await matchVscReplyBatch(tenantId, batch.envelopes);
  let recorded = 0;
  for (const candidate of matches) {
    const result = await recordVerifiedVscReply(candidate, tenantId);
    if (result.recorded) recorded++;
  }
  // Any IMAP, lookup or journal failure leaves the cursor unchanged; retries are idempotent.
  await saveVscImapCursor(tenantId, cursor, batch);
  return { inspected: batch.scanned, matched: matches.length, recorded, hasMore: batch.hasMore };
}
