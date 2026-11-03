import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import type { TenantContext } from "@/types/domain";
import { canManageLfiEmail, createBrevoSmtpTransport, LFI_BREVO_SENDER } from "./brevo-smtp";

export const TEST_RECIPIENT = "renatoponzio@gmail.com";
const TEST_VERSION = "brevo-delivery-plain-v5";
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
      subject: "Test technique Brevo — Les Formateurs Immo",
      text: "Bonjour Renato,\\n\\nCeci est un test technique simplifié depuis Atlas via Brevo. Merci de confirmer sa réception.\\n\\nAucune campagne commerciale n’a été activée."
    });
    accepted = result.accepted.some(address => typeof address === "string" && address.toLowerCase() === TEST_RECIPIENT);
  } catch (error) {
    // Log only safe SMTP metadata, never credentials or the full SMTP dialogue.
    const smtpError = typeof error === "object" && error !== null
      ? error as { code?: unknown; command?: unknown; responseCode?: unknown; response?: unknown }
      : {};
    console.error("[Atlas LFI] Brevo delivery test failed", {
      code: typeof smtpError.code === "string" ? smtpError.code : undefined,
      command: typeof smtpError.command === "string" ? smtpError.command : undefined,
      responseCode: typeof smtpError.responseCode === "number" ? smtpError.responseCode : undefined,
      response: typeof smtpError.response === "string"
        ? smtpError.response.replace(/[\\r\\n]+/g, " ").replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/gi, "[email]").slice(0, 200)
        : undefined
    });
    // The server may have accepted DATA before a timeout: do not automatically retry.
  } finally {
    transport.close();
  }
  const saved = await db.from("ionos_delivery_tests").update({
    status: accepted ? "accepted" : "uncertain", completed_at: new Date().toISOString()
  }).eq("tenant_id", context.tenantId).eq("test_version", TEST_VERSION);
  if (saved.error || !accepted) return { success: false, error: "Résultat du test à vérifier dans Gmail. Aucun renvoi automatique ne sera effectué." };
  return { success: true, message: `Brevo a accepté le message pour ${TEST_RECIPIENT}. Vérifiez sa réception, y compris dans les indésirables, puis répondez « Bien reçu ». Les campagnes restent désactivées.` };
}
