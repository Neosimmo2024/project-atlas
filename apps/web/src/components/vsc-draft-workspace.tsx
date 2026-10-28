"use client";
import { useEffect, useState } from "react";
import { VSC_OFFER_END } from "@/features/vsc-campaign/policy";
import { defaultVscEmailContent, type VscEmailContent, type VscEmailStep } from "@/features/vsc-campaign/email-content";
import type { VscPlannedDelivery } from "@/features/vsc-campaign/review-plan";
import type { VscDraftContact } from "@/services/vsc-draft-workspace";

type Workspace = { defaultContent: VscEmailContent; contacts: VscDraftContact[]; limited: boolean; campaigns: { id: string; name: string; state: string; created_at: string }[] };
type SavedReview = { campaign: { id: string; name: string; state: string; email_content: VscEmailContent | null }; deliveries: { step_key: string; scheduled_at: string; status: string; channel: string }[]; limited: boolean };
type Preview = { content: VscEmailContent; plan: VscPlannedDelivery[]; reviewKey: string; contacts: VscDraftContact[]; sendingEnabled: false };
const stepLabels: Record<string, string> = { offer: "Présentation de l’offre", consideration: "Relance à J+20", "last-chance": "Relance à J+40" };
function EmailCopyReview({ content, steps }: { content: VscEmailContent; steps: Set<string> }) {
  return <div className="stack">{content.messages.filter(message => steps.has(message.stepKey)).map(message => <article key={message.stepKey} className="card stack">
    <h4>{stepLabels[message.stepKey]}</h4><p><strong>Objet : {message.subject}</strong></p>
    <p style={{ whiteSpace: "pre-wrap" }}>{message.text}</p>
  </article>)}<p className="muted">Le lien personnel de désinscription sera ajouté par le transport lors d’un envoi autorisé. Aucun lien de test n’est inclus dans ces textes.</p></div>;
}
export function VscDraftWorkspace({ today }: { today: string }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [content, setContent] = useState<VscEmailContent>(defaultVscEmailContent);
  const [savedReview, setSavedReview] = useState<SavedReview | null>(null);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [selected, setSelected] = useState<string[]>([]);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [attemptedSave, setAttemptedSave] = useState(false);
  const [saved, setSaved] = useState<{ submitted: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void fetch("/api/admin/vsc-drafts", { cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error("Préparation indisponible");
      return await response.json() as Workspace;
    }).then(data => { if (active) { setWorkspace(data); setContent(data.defaultContent); } }).catch(() => { if (active) setError("Impossible de charger les contacts et brouillons."); });
    return () => { active = false; };
  }, []);
  const locked = busy || attemptedSave;
  const contactNames = new Map(preview?.contacts.map(contact => [contact.id, contact.display_name]) ?? []);
  function invalidatePreview() { setPreview(null); setError(null); }
  async function prepare(action: "preview" | "save") {
    setBusy(true); setError(null);
    const id = campaignId ?? crypto.randomUUID(); setCampaignId(id);
    if (action === "save") setAttemptedSave(true);
    try {
      const response = await fetch("/api/admin/vsc-drafts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        action, draft: { campaignId: id, name, startDate, personIds: selected, content }, reviewKey: preview?.reviewKey
      }) });
      const data = await response.json();
      if (!response.ok) {
        if (action === "save" && response.status === 400) { setAttemptedSave(false); setPreview(null); }
        throw new Error(data.error ?? "Opération indisponible");
      }
      if (action === "preview") {
        if (data.sendingEnabled !== false) throw new Error("Aperçu invalide");
        setPreview(data as Preview);
      } else {
        setSaved(data);
        setWorkspace(current => current ? { ...current, campaigns: current.campaigns.some(c => c.id === id) ? current.campaigns : [{ id, name: name.trim(), state: "draft", created_at: new Date().toISOString() }, ...current.campaigns].slice(0, 20) } : current);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Opération indisponible"); }
    finally { setBusy(false); }
  }
  function newDraft() {
    setContent(workspace?.defaultContent ?? defaultVscEmailContent()); setSavedReview(null);
    setName(""); setSelected([]); setCampaignId(null); setPreview(null); setSaved(null); setAttemptedSave(false); setError(null);
  }
  function updateMessage(stepKey: VscEmailStep, field: "subject" | "text", value: string) {
    setContent(current => ({ ...current, messages: current.messages.map(message => message.stepKey === stepKey ? { ...message, [field]: value } : message) }));
    invalidatePreview();
  }
  async function readSaved(campaignId: string) {
    setBusy(true); setError(null); setSavedReview(null);
    try {
      const response = await fetch(`/api/admin/vsc-drafts?campaignId=${encodeURIComponent(campaignId)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Lecture du brouillon indisponible");
      setSavedReview(await response.json() as SavedReview);
    } catch { setError("Impossible de relire ce brouillon pour le moment."); }
    finally { setBusy(false); }
  }
  return <>
    <section className="card stack" aria-busy={busy} aria-label="Création de brouillon email VendreSonCommerce">
      <h2>Nouveau brouillon email</h2>
      {today > VSC_OFFER_END ? <p>La promotion est terminée. La préparation de cette offre est fermée.</p> : <>
        <label>Nom du brouillon<input value={name} maxLength={150} disabled={locked} onChange={event => { setName(event.target.value); invalidatePreview(); }} /></label>
        <label>Date de départ<input type="date" min={today} max={VSC_OFFER_END} value={startDate} disabled={locked} onChange={event => { setStartDate(event.target.value); invalidatePreview(); }} /></label>
        {!workspace && !error ? <p>Chargement des contacts…</p> : null}
        {workspace ? <fieldset disabled={locked} className="stack"><legend>Contacts VendreSonCommerce autorisés ({selected.length} sélectionnés)</legend>
          {!workspace.contacts.length ? <p>Aucun contact email éligible. Les contacts sans autorisation, désinscrits ou ayant répondu sont exclus.</p> : null}
          {workspace.limited ? <p>Les 100 premiers contacts éligibles sont présentés. Ce brouillon est limité à cette sélection.</p> : null}
          {workspace.contacts.map(contact => <label key={contact.id}><input type="checkbox" checked={selected.includes(contact.id)} onChange={event => {
            setSelected(current => event.target.checked ? [...current, contact.id] : current.filter(id => id !== contact.id)); invalidatePreview();
          }} /> {contact.display_name} — {contact.primary_email}</label>)}
        </fieldset> : null}
        <p>Emails proposés à J0, J+20 et J+40. Les étapes après le 30 novembre sont retirées. Les textes ci-dessous sont des propositions à relire et ne sont pas approuvés.</p>
        <fieldset disabled={locked || !workspace} className="stack"><legend>Objets et textes proposés</legend>
          {content.messages.map(message => <div key={message.stepKey} className="stack">
            <h3>{stepLabels[message.stepKey]}</h3>
            <label>Objet — {stepLabels[message.stepKey]}<input value={message.subject} maxLength={200} onChange={event => updateMessage(message.stepKey, "subject", event.target.value)} /></label>
            <label>Texte — {stepLabels[message.stepKey]}<textarea value={message.text} rows={10} maxLength={6000} onChange={event => updateMessage(message.stepKey, "text", event.target.value)} /></label>
          </div>)}
        </fieldset>
        <button type="button" className="button" disabled={locked || !workspace || !selected.length || !name.trim() || !startDate} onClick={() => void prepare("preview")}>Afficher l’aperçu des relances</button>
        {preview ? <div className="stack" aria-label="Aperçu du brouillon">
          <h3>{preview.plan.length} emails à relire pour {preview.contacts.length} contact{preview.contacts.length > 1 ? "s" : ""}</h3>
          <table><thead><tr><th>Contact</th><th>Étape</th><th>Date proposée</th></tr></thead><tbody>
            {preview.plan.map(item => <tr key={item.key}><td>{contactNames.get(item.leadId)}</td><td>{stepLabels[item.stepKey] ?? item.stepKey}</td><td>{item.scheduledDate.split("-").reverse().join("/")}</td></tr>)}
          </tbody></table>
          <EmailCopyReview content={preview.content} steps={new Set(preview.plan.map(item => item.stepKey))} />
          <p>Enregistrer conserve uniquement un brouillon non approuvé. Aucun envoi ne sera déclenché.</p>
          <button type="button" className="button" disabled={busy || !!saved} onClick={() => void prepare("save")}>{busy ? "Opération en cours…" : attemptedSave && !saved ? "Réessayer la sauvegarde du même brouillon" : "Enregistrer le brouillon sans envoi"}</button>
        </div> : null}
        {saved ? <><p role="status">Brouillon enregistré : {saved.submitted} emails au statut brouillon. Aucun envoi activé.</p><button type="button" className="button" onClick={newDraft}>Préparer un autre brouillon</button></> : null}
        {attemptedSave && !saved && !busy ? <p>La demande est conservée pour éviter un doublon. Réessayez la sauvegarde du même brouillon.</p> : null}
      </>}
      {error ? <p role="alert">{error}</p> : null}
    </section>
    <section className="card stack" aria-label="Campagnes VendreSonCommerce enregistrées"><h2>Dernières campagnes enregistrées</h2>
      {workspace?.campaigns.length === 0 ? <p>Aucune campagne enregistrée.</p> : null}
      {workspace?.campaigns.map(campaign => <div key={campaign.id}><p>{campaign.name} — {campaign.state === "draft" ? "Brouillon non approuvé" : campaign.state}</p>
        <button type="button" className="button" disabled={busy} onClick={() => void readSaved(campaign.id)}>Relire « {campaign.name} »</button></div>)}
      {savedReview ? <div className="stack" aria-label="Textes du brouillon enregistré">
        <h3>{savedReview.campaign.name}</h3>
        <p>{savedReview.deliveries.length} livraisons enregistrées — état : {savedReview.campaign.state === "draft" ? "brouillon non approuvé" : savedReview.campaign.state}.</p>
        {savedReview.limited ? <p>Affichage partiel : seules les 500 premières livraisons sont consultées.</p> : null}
        {savedReview.campaign.email_content ? <EmailCopyReview content={savedReview.campaign.email_content} steps={new Set(savedReview.deliveries.filter(item => item.channel === "email").map(item => item.step_key))} /> : <p>Ce brouillon ancien n’a pas de textes enregistrés.</p>}
        <p>Cette relecture montre les textes conservés lors de la sauvegarde. Elle ne déclenche aucun envoi.</p>
      </div> : null}
      <p>Les 20 dernières campagnes sont affichées. L’approbation et l’activation ne sont pas disponibles sur cette page.</p>
    </section>
  </>;
}
