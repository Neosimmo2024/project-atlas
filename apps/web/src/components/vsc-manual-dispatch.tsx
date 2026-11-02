"use client";
import { useEffect, useState } from "react";
type Campaign = { id: string; name: string; state: string };
type Row = { deliveryId: string; displayName: string; recipient: string; stepKey: string; scheduledAt: string; status: string; subject: string; text: string; due: boolean; eligible: boolean; canSend: boolean; blockers: string[]; reviewKey: string };
type Review = { campaign: Campaign; rows: Row[]; limited: boolean; dispatchEnabled: boolean };
function dateLabel(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(value));
}
function stepLabel(step: string) {
  return step === "consideration" ? "Relance J+20" : step === "last-chance" ? "Dernier jour" : "Présentation de l’offre";
}
export function VscManualDispatch() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selected, setSelected] = useState("");
  const [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  useEffect(() => {
    void fetch("/api/admin/vsc-manual-send", { cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error("Campagnes indisponibles");
      return await response.json() as { campaigns: Campaign[] };
    }).then(data => setCampaigns(data.campaigns)).catch(() => setError("Impossible de charger les campagnes pour la revue manuelle."));
  }, []);
  async function loadCampaign(id: string, preserveStatus = false) {
    setSelected(id); setReview(null); if (!preserveStatus) setStatus(null); setError(null);
    if (!id) return;
    setBusy(true);
    try {
      const response = await fetch("/api/admin/vsc-manual-send?campaignId=" + encodeURIComponent(id), { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Relecture indisponible");
      setReview(data as Review);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Relecture indisponible"); }
    finally { setBusy(false); }
  }
  async function send(row: Row) {
    if (!review || !row.canSend) return;
    const accepted = window.confirm("Cette action approuve et active la campagne « " + review.campaign.name + " », puis envoie uniquement cet email à " + row.recipient + ".\n\nObjet : " + row.subject + "\n\nVérifie le destinataire, le texte et la date prévue. Aucun autre destinataire ne sera traité.");
    if (!accepted) return;
    setBusy(true); setError(null); setStatus(null);
    try {
      const response = await fetch("/api/admin/vsc-manual-send", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: review.campaign.id, deliveryId: row.deliveryId, reviewKey: row.reviewKey, confirmed: true })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Envoi manuel indisponible");
      const result = data.result as { state: string; reason?: string };
      setStatus(result.state === "sent" ? "Email envoyé à " + row.recipient + "." :
        result.state === "review_required" ? "Résultat à vérifier manuellement avant toute autre action." :
        result.state === "disabled" ? "Envoi désactivé dans la configuration actuelle." :
        result.state === "blocked" ? "Envoi bloqué : " + (result.reason ?? "contrôle requis") :
        "Email non envoyé : " + result.state + (result.reason ? " (" + result.reason + ")" : ""));
      await loadCampaign(review.campaign.id, true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Envoi manuel indisponible"); }
    finally { setBusy(false); }
  }
  return <section className="card stack" aria-label="Revue et envoi manuel VSC">
    <h2>Revue et envoi manuel, un email à la fois</h2>
    <p>Chaque message affiche son destinataire, son texte et sa date. Après relecture et confirmation explicite, l’action approuve et active cette campagne puis traite uniquement la livraison choisie. L’envoi manuel est réservé à la production configurée. Aucun calendrier d’envoi n’est utilisé.</p>
    <label>Campagne à relire
      <select value={selected} disabled={busy} onChange={event => void loadCampaign(event.target.value)}>
        <option value="">Choisir une campagne</option>
        {campaigns.map(item => <option key={item.id} value={item.id}>{item.name} — {item.state}</option>)}
      </select>
    </label>
    {busy ? <p>Chargement…</p> : null}
    {review?.limited ? <p>Affichage limité aux 500 premières livraisons. Sélectionnez un autre lot si nécessaire.</p> : null}
    {review?.rows.map(row => <article className="card stack" key={row.deliveryId}>
      <h3>{stepLabel(row.stepKey)} — {row.displayName}</h3>
      <p><strong>Destinataire :</strong> {row.recipient || "Adresse indisponible"}</p>
      <p><strong>Date prévue :</strong> {dateLabel(row.scheduledAt)}</p>
      <p><strong>Objet :</strong> {row.subject || "Objet indisponible"}</p>
      <p style={{ whiteSpace: "pre-wrap" }}>{row.text}</p>
      {row.canSend ? <button type="button" className="button" disabled={busy} onClick={() => void send(row)}>Envoyer uniquement cet email</button> :
        <p className="muted">Bloqué : {row.blockers.join(" · ") || "contrôle requis"}.</p>}
    </article>)}
    {status ? <p role="status">{status}</p> : null}
    {error ? <p role="alert">{error}</p> : null}
  </section>;
}
