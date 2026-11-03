/**
 * Read-only matching of OVH IMAP headers to already-sent VSC messages.
 * The caller supplies authoritative outbound rows fetched for the VSC tenant.
 * This function never writes to Supabase or sends mail.
 */
import { findVscOriginalMessageId, type VscInboundEnvelope } from "./imap-envelope";
import { validateVscReplyCandidate, type VscReplyCandidate } from "./inbound-replies";

export type VscOutboundMatch = {
  tenantId: string;
  campaignId: string;
  personId: string;
  recipientEmail: string;
  providerMessageId: string;
};

export function matchVscInboxReplies(input: {
  tenantId: string;
  envelopes: VscInboundEnvelope[];
  outbounds: VscOutboundMatch[];
}): VscReplyCandidate[] {
  const matches: VscReplyCandidate[] = [];
  const seen = new Set<string>();
  for (const envelope of input.envelopes) {
    if (!envelope.messageId || !envelope.from || !envelope.receivedAt) continue;
    if (seen.has(envelope.messageId)) continue;
    const original = findVscOriginalMessageId(
      envelope,
      input.outbounds.filter(x => x.tenantId === input.tenantId).map(x => x.providerMessageId)
    );
    if (!original) continue;
    const outbound = input.outbounds.find(x =>
      x.tenantId === input.tenantId && x.providerMessageId === original &&
      x.recipientEmail.toLowerCase() === envelope.from!.toLowerCase()
    );
    if (!outbound) continue;
    const candidate: VscReplyCandidate = {
      tenantId: input.tenantId, campaignId: outbound.campaignId, personId: outbound.personId,
      inboundMessageId: envelope.messageId, originalOutboundMessageId: original,
      inboundFrom: envelope.from, expectedEmail: outbound.recipientEmail,
      isReplyToCampaign: true, receivedAt: envelope.receivedAt
    };
    if (validateVscReplyCandidate(candidate, input.tenantId).accepted) {
      seen.add(envelope.messageId);
      matches.push(candidate);
    }
  }
  return matches;
}
