"use client";
import { useId, useState } from "react";
type Props = { taskId: string; incoming: string; initialDraft: string; initialRevision: number; initialStatus: string; email: string; verifyCampaign?: boolean; campaignName?: string };
export function ReplyReview(props: Props) {
  const id = useId();
  const [body, setBody] = useState(props.initialDraft);
  const [revision, setRevision] = useState(props.initialRevision);
  const [status, setStatus] = useState(props.initialStatus);
  const [busy, setBusy] = useState(false);
  const [approved, setApproved] = useState(false);
  const [message, setMessage] = useState("");
  async function act(action: "save" | "send") {
    if (busy || status !== "draft" || (action === "send" && !approved)) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/mailbox/replies/${props.taskId}`, { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, body, revision,
          ...(action === "send" ? { confirmation: "approve_exact_reply" } : {}) }) });
      const result = await response.json();
      if (!response.ok) {
        if (action === "send") setStatus("unknown");
        throw new Error(result.error);
      }
      setStatus(result.status); setRevision(result.revision); setApproved(false);
      setMessage(result.status === "sent" ? "Réponse acceptée par Brevo. La séquence automatique reste arrêtée."
        : result.status === "draft" ? "Brouillon enregistré. Aucun envoi."
        : "Envoi non confirmé. Vérifiez Brevo avant toute nouvelle action.");
    } catch (error) {
      if (action === "send") setStatus("unknown");
      setMessage(error instanceof Error ? error.message : "Action non confirmée. Rechargez la fiche.");
    } finally { setBusy(false); }
  }
  return <article className="card stack" id={`reply-${props.taskId}`}>
    <h3>Réponse à traiter</h3>
    {props.verifyCampaign && <p>Correspondance à confirmer avec la campagne « {props.campaignName ?? "Brevo"} » : rapprochement par destinataire et objet. Vérifiez l’échange avant de valider.</p>}
    <p><strong>Message reçu</strong></p>
    <p style={{ whiteSpace: "pre-wrap" }}>{props.incoming}</p>
    <p>Destinataire : <strong>{props.email}</strong>. Expéditeur : renato.ponzio@neos-immo.com.</p>
    {status === "draft" ? <>
      <label htmlFor={`${id}-draft`}>Proposition de réponse — à relire et adapter</label>
      <textarea id={`${id}-draft`} className="input" rows={12} maxLength={10000} value={body} disabled={busy}
        onChange={event => { setBody(event.target.value); setApproved(false); }} />
      <button className="button subtle-button" disabled={busy || !body.trim()} onClick={() => void act("save")}>Enregistrer le brouillon</button>
      <label><input type="checkbox" checked={approved} disabled={busy} onChange={event => setApproved(event.target.checked)} /> J’ai relu ce texte{props.verifyCampaign ? ", confirmé la correspondance avec la campagne" : ""} et je valide son envoi à {props.email}.</label>
      <button className="button" disabled={busy || !approved || !body.trim()} onClick={() => void act("send")}>{busy ? "Traitement…" : "Valider et envoyer cette réponse"}</button>
    </> : <p>{status === "sent" ? "Réponse envoyée — aucun nouvel envoi autorisé pour ce message." : "Envoi en cours, refusé ou incertain : contrôle manuel nécessaire dans Brevo."}</p>}
    <p role="status" aria-live="polite">{message}</p>
  </article>;
}
