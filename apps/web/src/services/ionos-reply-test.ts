import { ImapFlow } from "imapflow";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import type { TenantContext } from "@/types/domain";
import { canManageIonos, IONOS_SENDER } from "./ionos-connection";

const RECIPIENT = "renatoponzio@gmail.com";

/** Read-only pilot check, limited to replies to the signed test. No campaign processing. */
export async function verifyIonosTestReply(context: TenantContext) {
  if (!canManageIonos(context)) return { success: false, error: "Accès non autorisé." };
  const password = process.env.LFI_IONOS_SMTP_PASSWORD;
  if (!password) return { success: false, error: "Connexion IONOS non configurée." };
  const db = createSupabaseServiceRoleClient();
  const { data: latestTest, error: lookupError } = await db.from("ionos_delivery_tests")
    .select("test_version").eq("tenant_id", context.tenantId).eq("status", "accepted")
    .order("completed_at", { ascending: false }).limit(1).maybeSingle();
  if (lookupError || !latestTest?.test_version) {
    return { success: false, error: "Aucun email de test accepté à contrôler pour cette boîte." };
  }
  const imap = new ImapFlow({
    host: "imap.ionos.fr", port: 993, secure: true,
    auth: { user: IONOS_SENDER, pass: password },
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    logger: false, logRaw: false, disableAutoIdle: true,
    connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 10000,
    maxLiteralSize: 1048576, maxResponseSize: 2097152
  });
  // EventEmitter errors must be handled without logging mailbox content or credentials.
  imap.on("error", () => imap.close());
  const timeout = setTimeout(() => imap.close(), 25000);
  try {
    await imap.connect();
    await imap.mailboxOpen("INBOX", { readOnly: true });
    const reference = `<atlas-brevo-${context.tenantId}-${latestTest.test_version}@lesformateursimmo.com>`;
    const uids = await imap.search({ from: RECIPIENT, header: { "In-Reply-To": reference } }, { uid: true });
    if (!Array.isArray(uids)) throw new Error("SEARCH_FAILED");
    let replyFound = false;
    if (uids.length) {
      for await (const message of imap.fetch(uids.slice(-10), { envelope: true }, { uid: true })) {
        if (message.envelope?.inReplyTo === reference && message.envelope.from?.some(address => address.address?.toLowerCase() === RECIPIENT)) replyFound = true;
      }
    }
    return { success: true, replyFound, message: replyFound
      ? "Votre réponse au mail signé a été retrouvée dans la boîte contact. Le test aller-retour est validé. Les campagnes restent désactivées."
      : "La lecture de la boîte contact fonctionne. Répondez au dernier mail de test signé depuis Gmail, puis relancez ce contrôle. Aucune réponse correspondante trouvée dans la boîte de réception." };
  } catch (error) {
    const imapError = typeof error === "object" && error !== null
      ? error as { code?: unknown; name?: unknown }
      : {};
    const code = typeof imapError.code === "string" && /^[A-Z0-9_]{2,40}$/.test(imapError.code)
      ? imapError.code : undefined;
    console.error("[Atlas LFI] IONOS reply test failed", {
      code,
      name: typeof imapError.name === "string" ? imapError.name : undefined
    });
    if (code === "AUTHENTICATIONFAILED" || code === "EAUTH") {
      return { success: false, error: "IONOS refuse l’identification IMAP de la boîte contact." };
    }
    if (code === "ETIMEDOUT" || code === "ECONNRESET" || code === "ECONNREFUSED") {
      return { success: false, error: "La connexion IMAP à IONOS est indisponible. Le serveur ne répond pas sur le port 993." };
    }
    return { success: false, error: code
      ? `Lecture IONOS indisponible (${code}).`
      : "Lecture IONOS indisponible. Vérifiez la connexion IMAP et réessayez." };
  } finally {
    clearTimeout(timeout);
    imap.close();
  }
}
