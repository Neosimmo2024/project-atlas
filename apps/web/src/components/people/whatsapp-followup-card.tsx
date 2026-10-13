"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { whatsappLink, whatsappConfirmationKey, type WhatsAppEvent } from "@/features/whatsapp/manual";
import { personalizeWhatsAppMessage, type WhatsAppTemplate } from "@/features/whatsapp/templates";
import type { Interaction } from "@/types/domain";

type Props = { personId: string; name: string; phone: string | null; canContact: boolean; canEdit: boolean; consent: boolean; history: Interaction[]; sent: Interaction[]; templates: WhatsAppTemplate[] };
export function WhatsAppFollowupCard({ personId, name, phone, canContact, canEdit, consent, history, sent, templates }: Props) {
  const router = useRouter();
  const [selectedTemplate, setSelectedTemplate] = useState(templates[0]?.id ?? "custom");
  const [message, setMessage] = useState(() => personalizeWhatsAppMessage(templates[0]?.body ?? "Bonjour [Prénom],", name));
  const [evidence, setEvidence] = useState("");
  const [response, setResponse] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [confirmedMessages, setConfirmedMessages] = useState<string[]>([]);
  const currentKey = whatsappConfirmationKey(message);
  const previousConfirmation = sent.find((item) => whatsappConfirmationKey(item.summary ?? "") === currentKey);
  const confirmed = Boolean(previousConfirmation) || confirmedMessages.includes(currentKey);
  const link = whatsappLink(phone, message);
  async function record(event: WhatsAppEvent, summary: string) {
    if (busy || (event === "sent" && confirmed)) return;
    setBusy(true); setFeedback("");
    try {
      const result = await fetch(`/api/people/${personId}/whatsapp`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event, summary }) });
      const body = await result.json();
      if (!result.ok) throw new Error(body.error ?? "Impossible d'enregistrer.");
      if (event === "sent") setConfirmedMessages((items) => [...items, whatsappConfirmationKey(summary)]);
      setFeedback("Suivi enregistré. Aucun message n'a été envoyé par Atlas."); router.refresh();
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Erreur réseau."); }
    finally { setBusy(false); }
  }
  return <section className="card stack">
    <h2>Relance WhatsApp</h2>
    <p>Envoi manuel : vérifiez le message dans WhatsApp, puis confirmez ici son envoi. Atlas ne lit pas les réponses.</p>
    <p><strong>Accord WhatsApp :</strong> {consent ? "Enregistré" : "À recueillir"}</p>
    {!canContact ? <p className="muted">Le contact est désactivé sur cette fiche. Aucune relance disponible.</p> : null}
    {canEdit && canContact && !consent ? <div className="stack">
      <label>Preuve de l’accord (date et contexte)<textarea className="input textarea" value={evidence} onChange={(event) => setEvidence(event.target.value)} maxLength={4000} /></label>
      <button className="button subtle-button" disabled={busy || !evidence.trim()} onClick={() => record("consent_granted", evidence)}>Enregistrer l’accord reçu</button>
    </div> : null}
    <label>Choisir un message<select className="input" value={selectedTemplate} disabled={!canEdit || busy} onChange={(event) => {
      const template = templates.find((item) => item.id === event.target.value);
      setSelectedTemplate(event.target.value);
      if (template) setMessage(personalizeWhatsAppMessage(template.body, name));
    }}>
      {templates.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}
      <option value="custom">Message libre</option>
    </select></label>
    <label>Message préparé<textarea className="input textarea" value={message} onChange={(event) => { setMessage(event.target.value); setSelectedTemplate("custom"); }} maxLength={4000} readOnly={!canEdit} /></label>
    {confirmed ? <p className="success" role="status"><strong>Envoi confirmé pour ce message.</strong>{previousConfirmation ? ` Le ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(previousConfirmation.interaction_date))}` : ""}</p> : null}
    <div className="actions">
      {canEdit && canContact && consent && link && !confirmed ? <a className="button" href={link} target="_blank" rel="noopener noreferrer">Ouvrir WhatsApp</a> : <span className="muted">Ouverture disponible avec un numéro international valide et l’accord du contact.</span>}
      {canEdit ? <button className="button subtle-button" disabled={busy || confirmed || !canContact || !consent || !message.trim()} onClick={() => record("sent", message)}>{confirmed ? "Envoi déjà confirmé" : "Confirmer : j’ai envoyé ce message"}</button> : null}
    </div>
    {canEdit ? <>
      <label>Réponse reçue / note de suivi<textarea className="input textarea" value={response} onChange={(event) => setResponse(event.target.value)} maxLength={4000} /></label>
      <div className="actions">
        <button className="button subtle-button" disabled={busy || !response.trim()} onClick={() => record("replied", response)}>Enregistrer la réponse</button>
        <button className="button subtle-button" disabled={busy} onClick={() => record("consent_revoked", response.trim() || "Relances WhatsApp arrêtées manuellement.")}>Ne plus relancer sur WhatsApp</button>
        <Link className="button subtle-button" href={`/tasks/new?sourceType=person&sourceId=${personId}&personId=${personId}&returnTo=${encodeURIComponent(`/people/${personId}`)}`}>Planifier la prochaine action</Link>
      </div>
      <p className="muted">L’arrêt concerne WhatsApp. Pour un refus de tout contact, activez « Ne pas contacter » dans la fiche.</p>
    </> : null}
    {feedback ? <p role="status">{feedback}</p> : null}
    <h3>Derniers événements WhatsApp</h3>
    {history.length ? history.map((item) => <p key={item.id}><Link href={`/interactions/${item.id}?returnTo=${encodeURIComponent(`/people/${personId}`)}`}>{item.title}</Link> — {new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(item.interaction_date))}</p>) : <p className="muted">Aucun échange enregistré.</p>}
  </section>;
}
