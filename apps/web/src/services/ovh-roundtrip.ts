import { randomUUID } from "node:crypto";
import { ImapFlow } from "imapflow";
import type { TenantContext } from "@/types/domain";
import { canManageOvh, createOvhTransport, OVH_SENDER } from "./ovh-connection";

/** One explicit self-addressed test. No campaign writes or mailbox flag changes. */
export async function verifyOvhRoundtrip(context: TenantContext) {
  if (!canManageOvh(context)) return { success: false, error: "Accès non autorisé." };
  const password = process.env.VSC_OVH_SMTP_PASSWORD;
  if (!password) return { success: false, error: "Connexion OVH non configurée." };
  const reference = `<atlas-ovh-${randomUUID()}@vendresoncommerce.com>`;
  const imap = new ImapFlow({
    host: "ssl0.ovh.net", port: 993, secure: true,
    auth: { user: OVH_SENDER, pass: password },
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    logger: false, logRaw: false, disableAutoIdle: true,
    connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 8000,
    maxLiteralSize: 1048576, maxResponseSize: 2097152
  });
  imap.on("error", () => imap.close());
  const timer = setTimeout(() => imap.close(), 45000);
  let accepted = false;
  try {
    await imap.connect();
    await imap.mailboxOpen("INBOX", { readOnly: true });
    const transport = createOvhTransport(password);
    try {
      const sent = await transport.sendMail({
        from: { name: "VendreSonCommerce", address: OVH_SENDER },
        to: OVH_SENDER, replyTo: OVH_SENDER, messageId: reference,
        subject: "Test technique Atlas — réception OVH",
        text: "Message de contrôle envoyé par Atlas à la boîte VendreSonCommerce elle-même pour vérifier l’envoi et la réception. Aucune action nécessaire. Ce message ne fait partie d’aucune campagne."
      });
      accepted = sent.accepted.some(address => typeof address === "string" && address.toLowerCase() === OVH_SENDER);
    } finally { transport.close(); }
    if (!accepted) throw new Error("SMTP_NOT_ACCEPTED");
    for (let attempt = 0; attempt < 5; attempt++) {
      if (attempt) await new Promise(resolve => setTimeout(resolve, 1500));
      const uids = await imap.search({ header: { "Message-ID": reference } }, { uid: true });
      if (!Array.isArray(uids)) throw new Error("SEARCH_FAILED");
      if (uids.length) {
        for await (const mail of imap.fetch(uids.slice(-10), { envelope: true }, { uid: true })) {
          const env = mail.envelope;
          if (env?.messageId === reference && env.from?.some(a => a.address?.toLowerCase() === OVH_SENDER) && env.to?.some(a => a.address?.toLowerCase() === OVH_SENDER)) {
            return { success: true, message: "Test aller-retour réussi : OVH a envoyé le message et Atlas l’a retrouvé dans la boîte contact. La lecture IMAP fonctionne. Le traitement automatique des réponses aux campagnes reste à raccorder." };
          }
        }
      }
    }
    return { success: false, error: "OVH a accepté le message et la lecture IMAP fonctionne, mais le message n’est pas encore retrouvé dans INBOX. Vérifiez aussi les indésirables. Aucun renvoi automatique." };
  } catch {
    return { success: false, error: accepted ? "Message accepté par OVH, mais contrôle de réception indisponible. Aucun renvoi automatique." : "Test interrompu : connexion ou envoi OVH à vérifier. Vérifiez la boîte avant de relancer : un message peut avoir été accepté." };
  } finally { clearTimeout(timer); imap.close(); }
}
