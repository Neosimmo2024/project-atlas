"use server";

import { revalidatePath } from "next/cache";
import { diagnoseBrevoQaAccount } from "@/repositories/brevo-account-diagnostic";
import { inspectConfiguredBrevoContactAttempt } from "@/repositories/brevo-configured-contact-check";
import { closeConfiguredBrevoContactReview } from "@/repositories/brevo-contact-review";

export async function diagnoseAccountAction() {
  return diagnoseBrevoQaAccount();
}

export async function contactCommandAction(_previous: { message: string }, form: FormData) {
  const id = form.get("attemptId"), command = form.get("command");
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return { message: "Opération invalide." };
  if (command !== "check" && command !== "close") return { message: "Commande invalide." };
  try {
    if (command === "close") {
      const confirmation = form.get("confirmation");
      const result = await closeConfiguredBrevoContactReview(id, typeof confirmation === "string" ? confirmation : "");
      if (!result.closed) return { message: "La revue n’a pas été clôturée. Une observation récente et vérifiée ainsi que votre confirmation sont nécessaires." };
      revalidatePath("/admin/brevo-contacts");
      return { message: "Revue clôturée. Toute nouvelle tentative reste bloquée." };
    }
    const result = await inspectConfiguredBrevoContactAttempt(id);
    if (!result.recorded) return { message: "Contrôle non enregistré. Vérifiez la configuration du compte et vos droits, puis réessayez." };
    revalidatePath("/admin/brevo-contacts");
    const messages: Record<string, string> = {
      outcome_unresolved: "Contrôle enregistré : le résultat reste incertain. Nouvelle tentative bloquée.",
      linked_contact_observed_review_required: "Contrôle enregistré : un contact associé a été observé. La revue peut être clôturée en conservant le blocage.",
      suppression_observed_review_required: "Contrôle enregistré : les campagnes email et SMS sont bloquées. Le blocage transactionnel n’est pas confirmé par ce contrôle. La revue peut être clôturée en conservant le blocage.",
    };
    return { message: messages[result.status] ?? "Contrôle enregistré : la situation demande une vérification. Nouvelle tentative bloquée." };
  } catch { return { message: "Opération indisponible. Aucun réessai automatique n’est lancé." }; }
}

export async function pilotContactAction(_previous: { message: string }, form: FormData) {
  const { runBrevoContactPilot } = await import("@/repositories/brevo-contact-pilot");
  const confirmation = form.get("confirmation");
  const result = await runBrevoContactPilot(typeof confirmation === "string" ? confirmation : "");
  revalidatePath("/admin/brevo-contacts");
  const channels = "Campagnes email bloquées. Emails transactionnels bloqués pour les expéditeurs Brevo actuels. SMS : sans numéro. Aucun envoi effectué.";
  if (result.status === "created_verified") return { message: `Contact fictif créé et vérifié dans Brevo : ${result.contactId}. ${channels}` };
  if (result.status === "existing_verified") return { message: `Contact fictif déjà présent : ${result.contactId}. Aucun nouveau contact créé. ${channels}` };
  if (result.status === "channels_unconfirmed") return { message: `Le contact créé est conservé, mais le contrôle de ses canaux n’est pas confirmé. Aucune nouvelle création ni aucun envoi ne sont lancés automatiquement. Référence du contrôle QA : ${"diagnostic" in result ? result.diagnostic : "indisponible"}.` };
  return { message: "Test non confirmé. Consultez l’historique ; aucune relance automatique n’est effectuée." };
}

export async function sendPersonalSmsAction(_previous: { message: string }, form: FormData) {
  const { runSmsPersonalPilot } = await import("@/repositories/brevo-sms-pilot");
  const confirmation = form.get("confirmation"), recipient = form.get("recipient"), message = form.get("message");
  const result = await runSmsPersonalPilot(typeof confirmation === "string" ? confirmation : "", typeof recipient === "string" ? recipient : "", typeof message === "string" ? message : "");
  revalidatePath("/admin/brevo-contacts");
  const messages: Record<string, string> = {
    accepted: "Brevo a accepté le SMS. Cela ne confirme pas sa réception sur ton téléphone. Tout nouvel envoi est bloqué.",
    rejected: "Brevo a refusé le SMS. Aucun nouvel essai automatique ne sera effectué.",
    unknown: "Résultat à vérifier : le SMS a peut-être été transmis. Aucun nouvel essai n’est autorisé.",
    cancelled: "L’envoi a été annulé avant transmission. Tout nouvel essai reste bloqué.",
    locked_or_unavailable: "Le test est déjà enregistré ou son journal est indisponible. Aucun nouvel envoi n’est lancé.",
    disabled: "L’envoi réel n’est pas activé.",
    confirmation_required: "Confirme l’envoi unique au numéro affiché.",
    recipient_mismatch: "Le numéro confirmé ne correspond plus au numéro autorisé. Aucun envoi effectué.",
    account_unverified: "Le compte Brevo n’a pas pu être confirmé. Aucun envoi effectué.",
  };
  return { message: messages[result.status] ?? "L’envoi ne peut pas être lancé. Vérifie la configuration et tes droits." };
}
