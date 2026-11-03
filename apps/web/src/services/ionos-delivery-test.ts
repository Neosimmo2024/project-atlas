import { LFI_SIGNATURE_HTML, LFI_SIGNATURE_TEXT, lfiSignatureAttachments } from "./lfi-email-signature";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import type { TenantContext } from "@/types/domain";
import { canManageLfiEmail, createBrevoSmtpTransport, LFI_BREVO_SENDER } from "./brevo-smtp";

export const TEST_RECIPIENT = "renatoponzio@gmail.com";
const TEST_VERSION = "brevo-delivery-signature-v3-after-domain-auth";
const pending = "Un test a déjà été demandé. Vérifiez votre boîte Gmail et les indésirables. Aucun nouvel envoi n’a été effectué.";

/** One durable claim per tenant/version. Never automatically retry an ambiguous SMTP result. */
export async function sendIonosDeliveryTest(context: TenantContext) {
  if (!canManageLfiEmail(context)) return { success: false, error: "Accès non autorisé." };
  const password = process.env.LFI_BREVO_SMTP_PASSWORD;
  if (!password) return { success: false, error: "Connexion SMTP Brevo non configurée." };
  const db = createSupabaseServiceRoleClient();
  const claim = await db.from("ionos_delivery_tests").insert({
    tenant_id: context.tenantId, test_version: TEST_VERSION, requested_by: context.userId
  });
  if (claim.error) {
    return { success: false, error: claim.error.code === "23505" ? pending : "Enregistrement du test indisponible. Aucun email envoyé." };
  }
  const transport = createBrevoSmtpTransport(password);
  let accepted = false;
  try {
    const result = await transport.sendMail({
      from: { name: "Les Formateurs Immo", address: LFI_BREVO_SENDER },
      to: TEST_RECIPIENT, replyTo: LFI_BREVO_SENDER,
      messageId: `<atlas-brevo-${context.tenantId}-${TEST_VERSION}@lesformateursimmo.com>`,
      subject: "Test logo et signature validés — Les Formateurs Immo",
      text: "Bonjour Renato,\n\nCe message vérifie l’envoi depuis Atlas avec la boîte contact@lesformateursimmo.com via Brevo.\n\nMerci de vérifier sa réception et de répondre simplement « Bien reçu » pour préparer le contrôle des réponses.\n\nIl s’agit uniquement d’un test technique. Aucune campagne commerciale n’a été activée.\n\n" + LFI_SIGNATURE_TEXT,
      html: '<div style="font-family:Arial,sans-serif;color:#183248;line-height:1.6"><p>Bonjour Renato,</p><p>Ce message vérifie l’envoi depuis Atlas avec la boîte <strong>contact@lesformateursimmo.com</strong> via Brevo.</p><p>Merci de vérifier sa réception et de répondre simplement « Bien reçu » pour préparer le contrôle des réponses.</p><p>Il s’agit uniquement d’un test technique. Aucune campagne commerciale n’a été activée.</p></div>' + LFI_SIGNATURE_HTML,
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
  return { success: true, message: `Brevo a accepté le message pour ${TEST_RECIPIENT}. Vérifiez sa réception, y compris dans les indésirables, puis répondez « Bien reçu ». Les campagnes restent désactivées.` };
}
