/**
 * OVH IMAP read-only envelope collector for VendreSonCommerce.
 * No automatic polling, DB writes, message-body download, or dispatch.
 */
import { ImapFlow } from "imapflow";
import { normalizeVscInboundEnvelope, parseVscThreadHeaders, type VscInboundEnvelope } from "@/features/vsc-campaign/imap-envelope";
import { OVH_SENDER } from "@/services/ovh-connection";

export async function inspectVscInboxHeaders(limit = 50): Promise<VscInboundEnvelope[]> {
  const password = process.env.VSC_OVH_IMAP_PASSWORD ?? process.env.VSC_OVH_SMTP_PASSWORD;
  if (!password) throw new Error("OVH IMAP non configuré");
  const client = new ImapFlow({
    host: "ssl0.ovh.net", port: 993, secure: true,
    auth: { user: OVH_SENDER, pass: password },
    logger: false, disableAutoIdle: true
  });
  const result: VscInboundEnvelope[] = [];
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const total = client.mailbox && typeof client.mailbox === "object" ? client.mailbox.exists : 0;
      if (!total) return [];
      const from = Math.max(1, total - Math.min(Math.max(limit, 1), 200) + 1);
      for await (const message of client.fetch(`${from}:*`, {
        envelope: true, internalDate: true, headers: ["message-id", "in-reply-to", "references", "date"]
      })) {
        const envelope = message.envelope;
        if (!envelope) continue;
        const thread = parseVscThreadHeaders(message.headers?.toString("utf8") ?? "");
        const raw: VscInboundEnvelope = {
          messageId: envelope.messageId ?? null,
          from: envelope.from?.[0]?.address ?? null,
          inReplyTo: thread.inReplyTo ?? envelope.inReplyTo ?? null,
          references: thread.references,
          receivedAt: message.internalDate ? new Date(message.internalDate).toISOString() : null
        };
        const normalized = normalizeVscInboundEnvelope(raw);
        if (normalized) result.push(normalized);
      }
      return result;
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }
}
