"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { whatsappLink, type WhatsAppEvent } from "@/features/whatsapp/manual";
import type { Interaction } from "@/types/domain";

type Props = { personId: string; name: string; phone: string | null; canContact: boolean; canEdit: boolean; consent: boolean; history: Interaction[] };
export function WhatsAppFollowupCard({ personId, name, phone, canContact, canEdit, consent, history }: Props) {
  const router = useRouter();
  const [message, setMessage] = useState(`Bonjour ${name}, je reviens vers vous à la suite de notre échange. Seriez-vous disponible pour en discuter ?`);
  const [evidence, setEvidence] = useState("");
  const [response, setResponse] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const link = whatsappLink(phone, message);
  async function record(event: WhatsAppEvent, summary: string) {
    if (busy) return;
    setBusy(true); setFeedback("");
    try {
      const result = await fetch(`/api/people/${personId}/whatsapp`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event, summary }) });
      const body = await result.json();
      if (!result.ok) throw new Error(body.error ?? "Impossible d'enregistrer.");
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
    <label>Message préparé<textarea className="input textarea" value={message} onChange={(event) => setMessage(event.target.value)} maxLength={4000} readOnly={!canEdit} /></label>
    <div className="actions">
      {canEdit && canContact && consent && link ? <a className="button" href={link} target="_blank" rel="noopener noreferrer">Ouvrir WhatsApp</a> : <span className="muted">Ouverture disponible avec un numéro international valide et l’accord du contact.</span>}
      {canEdit ? <button className="button subtle-button" disabled={busy || !canContact || !consent || !message.trim()} onClick={() => record("sent", message)}>Confirmer : j’ai envoyé ce message</button> : null}
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
