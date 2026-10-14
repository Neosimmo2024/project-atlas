import "server-only";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { processBrevoInboundReplies } from "./recruitment-inbound-replies";
import { messageIdVariants, replyReferences } from "@/features/mailbox/reply-policy";

const host = "mail.neos-immo.com";
const email = "renato.ponzio@neos-immo.com";
type Configuration = { password: string; enabled: boolean; cursor?: number; validity?: string; lastSync?: string; lastError?: string | null; processed?: number };
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
    lastSync: config?.lastSync ?? null, lastError: config?.lastError ?? null, processed: config?.processed ?? 0 };
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

async function matchedReference(tenantId: string, references: string[]) {
  const db = createSupabaseServiceRoleClient();
  for (const reference of references) {
    const variants = messageIdVariants(reference);
    const initial = await db.from("recruitment_email_sequences").select("id")
      .eq("tenant_id", tenantId).in("provider_message_id", variants).limit(1).maybeSingle();
    if (initial.error) throw new Error("MAILBOX_LOOKUP_FAILED");
    if (initial.data) return reference;
    const step = await db.from("recruitment_email_sequence_steps").select("id")
      .eq("tenant_id", tenantId).in("provider_message_id", variants).limit(1).maybeSingle();
    if (step.error) throw new Error("MAILBOX_LOOKUP_FAILED");
    if (step.data) return reference;
  }
  return null;
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
    const uids = (found || []).filter(uid => uid > cursor).sort((a, b) => a - b).slice(0, 100);
    // Complete each FETCH before issuing another IMAP command.
    for (const uid of uids) {
      const item = await imap.fetchOne(uid, { envelope: true, size: true,
        headers: ["Message-ID", "In-Reply-To", "References", "Auto-Submitted", "Precedence"] }, { uid: true });
      if (!item) { cursor = uid; continue; }
      const header = await simpleParser(item.headers ?? Buffer.alloc(0));
      const reference = await matchedReference(tenantId, replyReferences(header));
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
      cursor = uid; scanned += 1;
    }
    const latest = await configuration(tenantId);
    if (latest?.password === config.password) await save(tenantId, { ...latest,
      cursor: latest.validity === validity ? Math.max(cursor, latest.cursor ?? 0) : cursor,
      validity, lastSync: new Date().toISOString(), lastError: null,
      processed: (latest.processed ?? 0) + processed });
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
    // Fail closed: no follow-up is sent if replies could not be checked.
    const result = await syncMailbox(tenant.id);
    if ("remaining" in result && result.remaining) throw new Error("MAILBOX_BACKLOG_PENDING");
  }
}
