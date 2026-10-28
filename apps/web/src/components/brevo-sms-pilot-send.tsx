"use client";
import { useActionState } from "react";
import { sendPersonalSmsAction } from "@/app/(app)/admin/brevo-contacts/actions";
import { SMS_PILOT_MESSAGE } from "@/features/recruitment-sms/pilot-preview";
import type { SmsPilotView } from "@/repositories/brevo-sms-pilot";

export function BrevoSmsPilotSend({ view }: { view: SmsPilotView }) {
  const [state, action, pending] = useActionState(sendPersonalSmsAction, { message: "" });
  const labels = {
    disabled: "Envoi désactivé : le numéro personnel et le compte SMS restent à valider.",
    unavailable: "Journal indisponible. Aucun envoi n’est possible.",
    pending: "Une tentative est enregistrée. Son résultat reste à vérifier ; aucun nouvel envoi n’est possible.",
    accepted: "SMS accepté par Brevo. La réception sur le téléphone reste à confirmer. Aucun nouvel envoi n’est possible.",
    rejected: "SMS refusé par Brevo. Aucun nouvel essai automatique.",
    unknown: "Résultat incertain : le SMS a peut-être été transmis. Aucun nouvel envoi n’est possible.",
    cancelled: "Tentative annulée avant transmission. Aucun nouvel envoi n’est possible.",
  };
  return <section className="card stack" aria-label="Envoi du SMS personnel">
    <h2>Envoyer un seul SMS de test</h2>
    {view.status === "ready" ? <>
      <p>Destinataire autorisé : <strong>{view.recipient}</strong></p>
      <p>Expéditeur : <strong>NEOSIMMO</strong></p>
      <p>{SMS_PILOT_MESSAGE}</p>
      <p>Un seul SMS technique sera transmis à Brevo. Il consommera les crédits SMS du compte selon le tarif applicable.</p>
      <form action={action} className="stack">
        <input type="hidden" name="recipient" value={view.recipient} />
        <input type="hidden" name="message" value={SMS_PILOT_MESSAGE} />
        <label><input type="checkbox" name="confirmation" value="send_one_personal_technical_sms" required disabled={pending} /> Je contrôle ce numéro et j’autorise l’envoi unique du message affiché.</label>
        <div><button className="button" disabled={pending}>{pending ? "Envoi en cours…" : "Envoyer ce SMS une seule fois"}</button></div>
      </form>
    </> : <p>{labels[view.status]}</p>}
    <p role="status" aria-live="polite">{state.message}</p>
  </section>;
}
