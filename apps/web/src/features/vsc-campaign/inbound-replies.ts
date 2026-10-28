/**
 * Read-only decision logic for linking inbound OVH replies to a VSC lead.
 * Actual IMAP ingestion must validate mailbox ownership, sender identity,
 * message threading, and tenant before writing a reply journal record.
 */
export type VscReplyCandidate = {
  tenantId: string;
  campaignId: string;
  personId: string;
  inboundMessageId: string;
  inboundFrom: string;
  expectedEmail: string;
  isReplyToCampaign: boolean;
  receivedAt: string;
};

export function validateVscReplyCandidate(
  candidate: VscReplyCandidate,
  configuredTenantId: string
): { accepted: true } | { accepted: false; reason: string } {
  if (!configuredTenantId || candidate.tenantId !== configuredTenantId)
    return { accepted: false, reason: "tenant_mismatch" };
  if (!candidate.isReplyToCampaign)
    return { accepted: false, reason: "unrelated_message" };
  if (!candidate.inboundFrom.trim() || candidate.inboundFrom.trim().toLowerCase() !== candidate.expectedEmail.trim().toLowerCase())
    return { accepted: false, reason: "sender_mismatch" };
  if (!candidate.inboundMessageId.trim() || candidate.inboundMessageId.length > 512)
    return { accepted: false, reason: "invalid_message_id" };
  if (Number.isNaN(Date.parse(candidate.receivedAt)))
    return { accepted: false, reason: "invalid_received_at" };
  return { accepted: true };
}
