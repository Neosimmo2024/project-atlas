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
      suppression_observed_review_required: "Contrôle enregistré : les emails et SMS sont bloqués. La revue peut être clôturée en conservant le blocage.",
    };
    return { message: messages[result.status] ?? "Contrôle enregistré : la situation demande une vérification. Nouvelle tentative bloquée." };
  } catch { return { message: "Opération indisponible. Aucun réessai automatique n’est lancé." }; }
}

export async function pilotContactAction(_previous: { message: string }, form: FormData) {
  const { runBrevoContactPilot } = await import("@/repositories/brevo-contact-pilot");
  const confirmation = form.get("confirmation");
  const result = await runBrevoContactPilot(typeof confirmation === "string" ? confirmation : "");
  revalidatePath("/admin/brevo-contacts");
  if (result.status === "created_verified") return { message: `Contact fictif créé et vérifié dans Brevo : ${result.contactId}. Emails et SMS bloqués.` };
  if (result.status === "existing_verified") return { message: `Contact fictif déjà présent : ${result.contactId}. Aucun nouveau contact créé. Emails et SMS bloqués.` };
  return { message: "Test non confirmé. Consultez l’historique ; aucune relance automatique n’est effectuée." };
}
