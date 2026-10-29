import { ImapFlow } from "imapflow";
import type { TenantContext } from "@/types/domain";
import { canManageIonos, IONOS_SENDER } from "./ionos-connection";

const RECIPIENT = "renatoponzio@gmail.com";

/** Read-only pilot check, limited to replies to the signed test. No campaign processing. */
export async function verifyIonosTestReply(context: TenantContext) {
  if (!canManageIonos(context)) return { success: false, error: "Accès non autorisé." };
  const password = process.env.LFI_IONOS_SMTP_PASSWORD;
  if (!password) return { success: false, error: "Connexion IONOS non configurée." };
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
    const reference = `<atlas-ionos-${context.tenantId}-delivery-signature-v3@lesformateursimmo.com>`;
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
  } catch {
    return { success: false, error: "Lecture IONOS indisponible. Vérifiez la disponibilité de la boîte et réessayez." };
  } finally {
    clearTimeout(timeout);
    imap.close();
  }
}
