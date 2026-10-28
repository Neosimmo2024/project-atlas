/**
 * OVH IMAP read-only envelope collector for VendreSonCommerce.
 * No automatic polling, DB writes, message-body download, or dispatch.
 */
import { planVscImapBatch } from "@/features/vsc-campaign/imap-cursor";
import { ImapFlow } from "imapflow";
import { normalizeVscInboundEnvelope, parseVscThreadHeaders, type VscInboundEnvelope } from "@/features/vsc-campaign/imap-envelope";
import { OVH_SENDER } from "@/services/ovh-connection";

/** A failed or truncated session must never produce a successful checkpoint. */
async function withVscImapSession<T>(read: (client: ImapFlow) => Promise<T>): Promise<T> {
  const password = process.env.VSC_OVH_IMAP_PASSWORD ?? process.env.VSC_OVH_SMTP_PASSWORD;
  if (!password) throw new Error("OVH IMAP non configuré");
  const client = new ImapFlow({
    host: "ssl0.ovh.net", port: 993, secure: true,
    auth: { user: OVH_SENDER, pass: password },
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    logger: false, logRaw: false, disableAutoIdle: true,
    connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 10000,
    maxLiteralSize: 1048576, maxResponseSize: 2097152
  });
  let interrupted = false;
  const abort = () => { interrupted = true; client.close(); };
  client.on("error", abort);
  const deadline = setTimeout(abort, 45000);
  try {
    await client.connect();
    const result = await read(client);
    if (interrupted) throw new Error("Lecture OVH interrompue : aucun point de reprise validé");
    return result;
  } finally {
    try { await client.logout().catch(() => undefined); }
    finally { clearTimeout(deadline); client.close(); }
  }
}

export async function inspectVscInboxHeaders(limit = 50): Promise<VscInboundEnvelope[]> {
  return withVscImapSession(async (client) => {
    const result: VscInboundEnvelope[] = [];
    const lock = await client.getMailboxLock("INBOX", { readOnly: true });
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
  });
}

/** Incremental, read-only mailbox batch; caller commits its cursor after DB processing. */
export async function inspectVscInboxBatch(cursor: import("@/features/vsc-campaign/imap-cursor").VscImapCursor): Promise<import("@/features/vsc-campaign/imap-cursor").VscImapBatch> {
  return withVscImapSession(async (client) => {
    const lock = await client.getMailboxLock("INBOX", { readOnly: true });
    try {
      if (!client.mailbox) throw new Error("Boîte IMAP indisponible");
      const uidValidity = client.mailbox.uidValidity.toString();
      const plan = planVscImapBatch(cursor, uidValidity, client.mailbox.uidNext);
      const envelopes: VscInboundEnvelope[] = [];
      let scanned = 0;
      if (plan.range) for await (const message of client.fetch(plan.range, {
        envelope: true, internalDate: true, headers: ["message-id", "in-reply-to", "references"]
      }, { uid: true })) {
        scanned++;
        const e = message.envelope;
        if (!e) continue;
        const thread = parseVscThreadHeaders(message.headers?.toString("utf8") ?? "");
        const normalized = normalizeVscInboundEnvelope({
          messageId: e.messageId ?? null, from: e.from?.[0]?.address ?? null,
          inReplyTo: thread.inReplyTo ?? e.inReplyTo ?? null, references: thread.references,
          receivedAt: message.internalDate ? new Date(message.internalDate).toISOString() : null
        });
        if (normalized) envelopes.push(normalized);
      }
      return { uidValidity, lastUid: plan.lastUid, hasMore: plan.hasMore, scanned, envelopes };
    } finally { lock.release(); }
  });
}

/** Safe initial checkpoint for a QA mailbox with no existing campaign sends. */
export async function getVscInboxCheckpoint() {
  return withVscImapSession(async client => {
    const lock = await client.getMailboxLock("INBOX", { readOnly: true });
    try {
      if (!client.mailbox) throw new Error("Boîte IMAP indisponible");
      return { uidValidity: client.mailbox.uidValidity.toString(), lastUid: client.mailbox.uidNext - 1 };
    } finally { lock.release(); }
  });
}
