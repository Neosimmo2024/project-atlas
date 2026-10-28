/**
 * Safe VSC reply reconciliation worker.
 * It is intentionally NOT scheduled or exposed via a public route.
 * Only the verified-reply service may mutate pending campaign deliveries.
 */
import { previewVscReplyReconciliation } from "@/services/vsc-reply-reconciliation";
import { recordVerifiedVscReply } from "@/services/vsc-inbound-reply-journal";

export async function reconcileVscRepliesOnce(tenantId: string): Promise<{
  inspected: number;
  matched: number;
  recorded: number;
}> {
  if (!tenantId || tenantId !== process.env.VSC_OVH_TENANT_ID?.trim())
    throw new Error("Entreprise non autorisée");
  const preview = await previewVscReplyReconciliation(tenantId);
  let recorded = 0;
  for (const candidate of preview.matches) {
    const result = await recordVerifiedVscReply(candidate, tenantId);
    if (result.recorded) recorded++;
  }
  return { inspected: preview.inspected, matched: preview.matches.length, recorded };
}
