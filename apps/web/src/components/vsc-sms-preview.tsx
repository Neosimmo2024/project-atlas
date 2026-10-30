"use client";
import { useEffect, useState } from "react";
import { defaultVscSmsContent, estimateVscSms, previewVscSms, type VscSmsStep } from "@/features/vsc-campaign/sms-content";
import type { VscSmsCopy } from "@/services/vsc-sms-copy-drafts";
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
  const [name, setName] = useState("");
  const [copyId, setCopyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState<{ drafts: VscSmsCopy[]; truncated: boolean } | null>(null);
  const [listError, setListError] = useState(false);
  useEffect(() => {
    let active = true;
    void fetch("/api/admin/vsc-sms-copies", { cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error();
      const data = await response.json(); if (active) setSaved(data);
    }).catch(() => { if (active) setListError(true); });
    return () => { active = false; };
  }, []);
  function invalidate() { setPreview(null); setError(""); setNotice(""); setCopyId(null); }
  async function save() {
    const id = copyId ?? crypto.randomUUID(); setCopyId(id); setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/vsc-sms-copies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, name, startDate, hasEmail, messages }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Sauvegarde indisponible");
      setNotice("Version SMS enregistrée. Aucun destinataire ni envoi créé.");
      try {
        const list = await fetch("/api/admin/vsc-sms-copies", { cache: "no-store" });
        if (!list.ok) throw new Error(); setSaved(await list.json()); setListError(false);
      } catch { setListError(true); }
    } catch (error) { setError(error instanceof Error ? error.message : "Sauvegarde indisponible. Réessayez sans modifier cette version."); }
    finally { setSaving(false); }
  }
  return <section className="card stack" aria-label="Préparation des SMS VendreSonCommerce">
    <h2>Préparer les SMS</h2>
    <p>Propositions à relire. Enregistrez une version après aperçu pour conserver vos textes. Aucun destinataire n’est sélectionné et aucun SMS n’est envoyé.</p>
    <fieldset className="stack" disabled={saving}><legend>Version de brouillon SMS</legend>
    <label>Nom de la version SMS<input value={name} maxLength={150} onChange={event => { setName(event.target.value); invalidate(); }} /></label>
    <p>Brevo remplace [STOP_CODE] par son numéro de désinscription lors de l’envoi. Ce repère est inclus dans les nouveaux modèles ; les anciennes versions enregistrées ne sont pas modifiées. Le traitement des STOP dans Atlas reste à raccorder.</p>
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
    {preview ? <button type="button" className="button" disabled={saving || !name.trim()} onClick={() => void save()}>{saving ? "Enregistrement…" : "Enregistrer cette version SMS"}</button> : null}
    </fieldset>
    {error ? <p role="alert">{error}</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
    {preview ? <div className="stack" role="status">
      <h3>Aperçu SMS — sans programmation</h3>
      {preview.length === 0 ? <p>Aucune étape SMS avant la fin de promotion pour cette date.</p> : <ul className="stack">{preview.map(message => <li key={message.stepKey}>
        <p><strong>{message.scheduledDate}</strong> — {labels[message.stepKey]}</p>
        <p style={{ whiteSpace: "pre-wrap" }}>{message.text}</p>
        <p>{message.segments} segment(s) estimé(s), {message.encoding}</p>
      </li>)}</ul>}
      <p>Le texte, l’expéditeur et le dispositif STOP VSC restent à valider avant tout raccordement à l’envoi.</p>
    </div> : null}
    <h3>Versions SMS enregistrées</h3>
    {listError ? <p role="alert">Liste temporairement indisponible. Rechargez la page pour la consulter.</p> : null}
    {!saved && !listError ? <p>Chargement des versions SMS…</p> : null}
    {saved?.drafts.length === 0 ? <p>Aucune version SMS enregistrée.</p> : null}
    {saved ? <ul>{saved.drafts.map(draft => <li key={draft.id}>{draft.name} — {draft.startDate} <button type="button" disabled={saving} onClick={() => {
      setName(draft.name); setStartDate(draft.startDate); setHasEmail(draft.hasEmail); setMessages(draft.messages); setPreview(null); setError(""); setCopyId(null);
      setNotice("Textes enregistrés chargés. Toute modification puis sauvegarde crée une nouvelle version.");
    }}>Relire {draft.name}</button></li>)}</ul> : null}
    {saved?.truncated ? <p>Les 20 dernières versions sont affichées.</p> : null}
  </section>;
}
