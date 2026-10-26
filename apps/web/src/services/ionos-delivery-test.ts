import { LFI_SIGNATURE_HTML, LFI_SIGNATURE_TEXT, lfiSignatureAttachments } from "./lfi-email-signature";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import type { TenantContext } from "@/types/domain";
import { canManageIonos, createIonosTransport, IONOS_SENDER } from "./ionos-connection";

export const TEST_RECIPIENT = "renatoponzio@gmail.com";
const TEST_VERSION = "delivery-signature-v2";
const pending = "Un test a déjà été demandé. Vérifiez votre boîte Gmail et les indésirables. Aucun nouvel envoi n’a été effectué.";

/** One durable claim per tenant/version. Never automatically retry an ambiguous SMTP result. */
export async function sendIonosDeliveryTest(context: TenantContext) {
  if (!canManageIonos(context)) return { success: false, error: "Accès non autorisé." };
  const password = process.env.LFI_IONOS_SMTP_PASSWORD;
  if (!password) return { success: false, error: "Connexion IONOS non configurée." };
  const db = createSupabaseServiceRoleClient();
  const claim = await db.from("ionos_delivery_tests").insert({
    tenant_id: context.tenantId, test_version: TEST_VERSION, requested_by: context.userId
  });
  if (claim.error) {
    return { success: false, error: claim.error.code === "23505" ? pending : "Enregistrement du test indisponible. Aucun email envoyé." };
  }
  const transport = createIonosTransport(password);
  let accepted = false;
  try {
    const result = await transport.sendMail({
      from: { name: "Les Formateurs Immo", address: IONOS_SENDER },
      to: TEST_RECIPIENT, replyTo: IONOS_SENDER,
      messageId: `<atlas-ionos-${context.tenantId}-${TEST_VERSION}@lesformateursimmo.com>`,
      subject: "Test Atlas — Les Formateurs Immo — IONOS",
      text: "Bonjour Renato,\n\nCe message vérifie l’envoi depuis Atlas avec la boîte contact@lesformateursimmo.com chez IONOS.\n\nMerci de vérifier sa réception et de répondre simplement « Bien reçu » pour préparer le contrôle des réponses.\n\nIl s’agit uniquement d’un test technique. Aucune campagne commerciale n’a été activée.\n\n" + LFI_SIGNATURE_TEXT,
      html: '<div style="font-family:Arial,sans-serif;color:#183248;line-height:1.6"><p>Bonjour Renato,</p><p>Ce message vérifie l’envoi depuis Atlas avec la boîte <strong>contact@lesformateursimmo.com</strong> chez IONOS.</p><p>Merci de vérifier sa réception et de répondre simplement « Bien reçu » pour préparer le contrôle des réponses.</p><p>Il s’agit uniquement d’un test technique. Aucune campagne commerciale n’a été activée.</p></div>' + LFI_SIGNATURE_HTML,
      attachments: lfiSignatureAttachments()
    });
    accepted = result.accepted.some(address => typeof address === "string" && address.toLowerCase() === TEST_RECIPIENT);
  } catch {
    // The server may have accepted DATA before a timeout: do not retry or reveal dialogue.
  } finally {
    transport.close();
  }
  const saved = await db.from("ionos_delivery_tests").update({
    status: accepted ? "accepted" : "uncertain", completed_at: new Date().toISOString()
  }).eq("tenant_id", context.tenantId).eq("test_version", TEST_VERSION);
  if (saved.error || !accepted) return { success: false, error: "Résultat du test à vérifier dans Gmail. Aucun renvoi automatique ne sera effectué." };
  return { success: true, message: `IONOS a accepté le message pour ${TEST_RECIPIENT}. Vérifiez sa réception, y compris dans les indésirables, puis répondez « Bien reçu ». Les campagnes restent désactivées.` };
}
