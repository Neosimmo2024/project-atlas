"use client";
import { useState } from "react";
import { defaultVscSmsContent, estimateVscSms, previewVscSms, type VscSmsStep } from "@/features/vsc-campaign/sms-content";
const labels: Record<VscSmsStep, string> = {
  "sms-reminder": "Email et mobile — rappel à J+5", "sms-initial": "Mobile seul — premier SMS",
  "sms-followup-1": "Mobile seul — relance à J+15", "sms-followup-2": "Mobile seul — relance à J+30", "sms-followup-3": "Mobile seul — relance à J+45"
};
export function VscSmsPreview({ today }: { today: string }) {
  const [messages, setMessages] = useState(defaultVscSmsContent);
  const [startDate, setStartDate] = useState(today);
  const [hasEmail, setHasEmail] = useState(true);
  const [preview, setPreview] = useState<ReturnType<typeof previewVscSms> | null>(null);
  const [error, setError] = useState("");
  function invalidate() { setPreview(null); setError(""); }
  return <section className="card stack" aria-label="Préparation des SMS VendreSonCommerce">
    <h2>Préparer les SMS</h2>
    <p>Propositions à relire. Les modifications restent dans cette page et ne sont pas enregistrées. Aucun destinataire n’est sélectionné et aucun SMS n’est envoyé.</p>
    <p>Le numéro de désinscription STOP doit être confirmé dans le compte Brevo VendreSonCommerce. Le repère [numero STOP VSC] reste volontairement dans les propositions.</p>
    <label>Date de départ du parcours SMS<input type="date" min={today} max="2026-11-30" value={startDate} onChange={event => { setStartDate(event.target.value); invalidate(); }} /></label>
    <label>Type de parcours SMS<select value={hasEmail ? "email-mobile" : "mobile"} onChange={event => { setHasEmail(event.target.value === "email-mobile"); invalidate(); }}>
      <option value="email-mobile">Email et mobile : SMS à J+5 du premier email</option>
      <option value="mobile">Mobile seul : J0, J+15, J+30, J+45</option>
    </select></label>
    <p>Les étapes après le 30 novembre 2026 sont retirées de l’aperçu. Une réponse ou une désinscription doit arrêter les relances.</p>
    <fieldset className="stack"><legend>Textes SMS proposés</legend>{messages.map(message => {
      const size = estimateVscSms(message.text);
      return <div className="stack" key={message.stepKey}>
        <label>{labels[message.stepKey]}<textarea rows={5} maxLength={2000} value={message.text} onChange={event => { setMessages(current => current.map(item => item.stepKey === message.stepKey ? { ...item, text: event.target.value } : item)); invalidate(); }} /></label>
        <p className="muted">Estimation : {size.encoding}, {size.units} unités, {size.segments} segment(s). Repère STOP inclus ; le décompte final sera à vérifier dans Brevo.</p>
      </div>;
    })}</fieldset>
    <button type="button" className="button" onClick={() => {
      try { setPreview(previewVscSms({ today, startDate, hasEmail, messages })); setError(""); }
      catch (error) { setPreview(null); setError(error instanceof Error ? error.message : "Aperçu indisponible"); }
    }}>Afficher l’aperçu SMS</button>
    {error ? <p role="alert">{error}</p> : null}
    {preview ? <div className="stack" role="status">
      <h3>Aperçu SMS — sans programmation</h3>
      {preview.length === 0 ? <p>Aucune étape SMS avant la fin de promotion pour cette date.</p> : <ul className="stack">{preview.map(message => <li key={message.stepKey}>
        <p><strong>{message.scheduledDate}</strong> — {labels[message.stepKey]}</p>
        <p style={{ whiteSpace: "pre-wrap" }}>{message.text}</p>
        <p>{message.segments} segment(s) estimé(s), {message.encoding}</p>
      </li>)}</ul>}
      <p>Le texte, l’expéditeur et le dispositif STOP VSC restent à valider avant tout raccordement à l’envoi.</p>
    </div> : null}
  </section>;
}
