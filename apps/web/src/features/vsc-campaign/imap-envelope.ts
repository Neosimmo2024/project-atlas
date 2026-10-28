/**
 * Parse IMAP envelope metadata only; no network calls and no email body storage.
 * Caller must separately authenticate the OVH mailbox and verify the original
 * outbound Message-ID against a sent VSC delivery.
 */
export type VscInboundEnvelope = {
  messageId: string | null;
  from: string | null;
  inReplyTo: string | null;
  references: string[];
  receivedAt: string | null;
};

const MESSAGE_ID = /^<[^<>\s]{1,500}>$/;
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export function normalizeVscInboundEnvelope(raw: VscInboundEnvelope): VscInboundEnvelope | null {
  const messageId = raw.messageId?.trim() ?? "";
  const from = raw.from?.trim().toLowerCase() ?? "";
  const inReplyTo = raw.inReplyTo?.trim() ?? "";
  const references = raw.references.map(ref => ref.trim()).filter(ref => MESSAGE_ID.test(ref));
  const receivedAt = raw.receivedAt ?? "";
  if (!MESSAGE_ID.test(messageId) || !EMAIL.test(from) ||
      !Number.isFinite(Date.parse(receivedAt)) ||
      (!MESSAGE_ID.test(inReplyTo) && !references.length)) return null;
  return {
    messageId, from, inReplyTo: MESSAGE_ID.test(inReplyTo) ? inReplyTo : null,
    references, receivedAt: new Date(receivedAt).toISOString()
  };
}

export function findVscOriginalMessageId(
  envelope: VscInboundEnvelope,
  outboundMessageIds: readonly string[]
): string | null {
  const known = new Set(outboundMessageIds);
  const candidates = [envelope.inReplyTo, ...envelope.references].filter((v): v is string => !!v);
  return candidates.find(value => known.has(value)) ?? null;
}
