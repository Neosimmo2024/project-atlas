import "server-only";
import { dispatchReplySmsAlerts } from "./reply-sms-alerts";
import { syncBrevoOutboundHistory } from "./brevo-outbound-history";
import { ImapFlow, type FetchMessageObject } from "imapflow";
import { simpleParser } from "mailparser";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { processBrevoInboundReplies } from "./recruitment-inbound-replies";
import { mailboxUidBatch, messageIdVariants, replyReferences, trackedReplyReference } from "@/features/mailbox/reply-policy";

const host = "mail.neos-immo.com";
const email = "renato.ponzio@neos-immo.com";
type Configuration = { password: string; enabled: boolean; cursor?: number; validity?: string; lastSync?: string; lastError?: string | null; processed?: number; remaining?: number };
const key = (tenantId: string) => `atlas_planet_mailbox_${tenantId}`;

async function configuration(tenantId: string): Promise<Configuration | null> {
  const { data, error } = await createSupabaseServiceRoleClient().rpc("get_vault_secret_value", { p_name: key(tenantId) });
  if (error) throw new Error("MAILBOX_STORAGE_UNAVAILABLE");
  return data ? JSON.parse(data as string) as Configuration : null;
}
async function save(tenantId: string, config: Configuration) {
  const { error } = await createSupabaseServiceRoleClient().rpc("set_vault_secret_value", {
    p_name: key(tenantId), p_value: JSON.stringify(config), p_description: "Atlas PlanetHoster mailbox — server only"
  });
  if (error) throw new Error("MAILBOX_STORAGE_UNAVAILABLE");
}
function client(password: string) {
  return new ImapFlow({ host, port: 993, secure: true, auth: { user: email, pass: password },
    logger: false, disableAutoIdle: true, connectionTimeout: 15000, greetingTimeout: 15000,
    socketTimeout: 30000, tls: { rejectUnauthorized: true } });
}
export async function mailboxStatus(tenantId: string) {
  const config = await configuration(tenantId);
  return { host, port: 993, email, configured: Boolean(config), enabled: config?.enabled ?? false,
    lastSync: config?.lastSync ?? null, lastError: config?.lastError ?? null, processed: config?.processed ?? 0, remaining: config?.remaining ?? null };
}
export async function connectMailbox(tenantId: string, password: string) {
  const imap = client(password);
  try {
    await imap.connect();
    await imap.mailboxOpen("INBOX", { readOnly: true });
  } catch {
    throw new Error("Connexion refusée : vérifiez le mot de passe de la boîte ou la disponibilité du serveur.");
  } finally { await imap.logout().catch(() => undefined); }
  await save(tenantId, { password, enabled: true });
}
export async function pauseMailbox(tenantId: string) {
  const config = await configuration(tenantId);
  if (config) await save(tenantId, { ...config, enabled: false });
}

export async function replayMailboxHistory(tenantId: string) {
  const config = await configuration(tenantId);
  if (!config?.enabled) throw new Error("MAILBOX_PAUSED");
  await save(tenantId, { ...config, cursor: 0, remaining: undefined });
}

async function trackedMessageIds(tenantId: string) {
  const db = createSupabaseServiceRoleClient();
  const ids = new Set<string>();
  for (const table of ["recruitment_email_sequences", "recruitment_email_sequence_steps", "tasks"]) {
    const task = table === "tasks";
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = task
        ? await db.from("tasks").select("metadata").eq("tenant_id", tenantId)
          .contains("metadata", { source: "recruitment_candidate_reply" })
          .not("metadata->>reply_provider_message_id", "is", null).order("id").range(offset, offset + 999)
        : await db.from(table).select("provider_message_id").eq("tenant_id", tenantId)
          .not("provider_message_id", "is", null).order("id").range(offset, offset + 999);
      if (error) throw new Error("MAILBOX_LOOKUP_FAILED");
      for (const row of data ?? []) {
        const record = row as unknown as { provider_message_id?: string; metadata?: { reply_provider_message_id?: string } };
        const value = task ? record.metadata?.reply_provider_message_id : record.provider_message_id;
        if (value) for (const variant of messageIdVariants(value)) ids.add(variant);
      }
      if ((data?.length ?? 0) < 1000) break;
    }
  }
  for (let offset = 0; ; offset += 1000) {
    const rows = await db.from("timeline_events").select("metadata").eq("tenant_id", tenantId)
      .contains("metadata", { source: "brevo_outbound_journal" }).order("id").range(offset, offset + 999);
    if (rows.error) throw new Error("MAILBOX_LOOKUP_FAILED");
    for (const row of rows.data ?? []) {
      const value = row.metadata?.provider_message_id;
      if (typeof value === "string") for (const variant of messageIdVariants(value)) ids.add(variant);
    }
    if ((rows.data?.length ?? 0) < 1000) break;
  }
  return ids;
}

export async function syncMailbox(tenantId: string) {
  const config = await configuration(tenantId);
  if (!config?.enabled) return { scanned: 0, processed: 0, stopped: 0, paused: true };
  const imap = client(config.password);
  let scanned = 0, processed = 0, stopped = 0;
  try {
    await imap.connect();
    const box = await imap.mailboxOpen("INBOX", { readOnly: true });
    const validity = box.uidValidity.toString();
    let cursor = config.validity === validity ? config.cursor ?? 0 : 0;
    const since = new Date(Date.now() - 90 * 86400000);
    const found = await imap.search({ since, ...(cursor ? { uid: `${cursor + 1}:*` } : {}) }, { uid: true });
    const { uids, historyIds } = mailboxUidBatch(found || [], cursor);
    const recentFound = await imap.search({ since: new Date(Date.now() - 24 * 3600000) }, { uid: true });
    const inspectionUids = [...new Set([...(recentFound || []).slice(-500), ...uids])];
    const trackedIds = await trackedMessageIds(tenantId);
    const messages = new Map<number, FetchMessageObject>();
    // Finish the header stream before fetching any message bodies (no nested IMAP commands).
    if (inspectionUids.length) for await (const message of imap.fetch(inspectionUids, { envelope: true, size: true,
      headers: ["Message-ID", "In-Reply-To", "References", "Auto-Submitted", "Precedence"] }, { uid: true })) {
      messages.set(message.uid, message);
    }
    for (const uid of inspectionUids) {
      const item = messages.get(uid);
      if (!item) { if (historyIds.has(uid)) cursor = uid; continue; }
      const header = await simpleParser(item.headers ?? Buffer.alloc(0));
      const reference = trackedReplyReference(replyReferences(header), trackedIds);
      if (reference && header.messageId) {
        let text = "Contenu non importé (message volumineux). Consultez votre messagerie.";
        if ((item.size ?? Infinity) <= 2 * 1024 * 1024) {
          const source = await imap.fetchOne(uid, { source: true }, { uid: true });
          if (source && source.source) {
            const parsed = await simpleParser(source.source, { skipHtmlToText: true, skipTextToHtml: true, skipImageLinks: true });
            text = parsed.text?.slice(0, 4000) ?? "Réponse reçue. Consultez votre messagerie pour le contenu.";
          }
        }
        const result = await processBrevoInboundReplies({ items: [{ MessageId: header.messageId,
          InReplyTo: reference, From: { Address: item.envelope?.from?.[0]?.address },
          Subject: item.envelope?.subject, SentAtDate: item.envelope?.date ? new Date(item.envelope.date).toISOString() : null,
          Source: "planethoster_imap", ExtractedMarkdownMessage: text }] }, tenantId);
        processed += result.processed; stopped += result.stopped;
      }
      if (historyIds.has(uid)) cursor = uid;
      scanned += 1;
    }
    const latest = await configuration(tenantId);
    if (latest?.password === config.password) await save(tenantId, { ...latest,
      cursor: latest.validity === validity ? Math.max(cursor, latest.cursor ?? 0) : cursor,
      validity, lastSync: new Date().toISOString(), lastError: null,
      processed: (latest.processed ?? 0) + processed, remaining: (found || []).filter(uid => uid > cursor).length });
    return { scanned, processed, stopped, remaining: (found || []).filter(uid => uid > cursor).length };
  } catch {
    const latest = await configuration(tenantId);
    if (latest?.password === config.password) await save(tenantId, { ...latest, lastError: "Synchronisation indisponible : vérifiez la connexion." });
    throw new Error("Synchronisation indisponible : vérifiez la connexion.");
  } finally { await imap.logout().catch(() => undefined); }
}

export async function syncConfiguredMailboxes() {
  const db = createSupabaseServiceRoleClient();
  const { data, error } = await db.from("tenants").select("id");
  if (error) throw new Error("MAILBOX_TENANTS_UNAVAILABLE");
  for (const tenant of data ?? []) {
    await syncBrevoOutboundHistory(tenant.id);
    // Fail closed: no follow-up is sent if replies could not be checked.
    const result = await syncMailbox(tenant.id);
    await dispatchReplySmsAlerts(tenant.id);
    if ("paused" in result && tenant.id === "8e27b0ff-3f1a-41fa-8390-628c718723a2") throw new Error("MAILBOX_PAUSED");
    if ("remaining" in result && result.remaining) throw new Error("MAILBOX_BACKLOG_PENDING");
  }
}
