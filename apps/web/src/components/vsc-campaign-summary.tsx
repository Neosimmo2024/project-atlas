"use client";

import { useEffect, useState } from "react";

type Summary = {
  campaigns: number;
  draft: number;
  scheduled: number;
  sent: number;
  failed: number;
  cancelled: number;
  replies: number;
  truncated: boolean;
};

export function VscCampaignSummary() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/admin/vsc-campaign-summary", { cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("Statistiques indisponibles");
        return await response.json() as Summary;
      })
      .then(data => { if (active) setSummary(data); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, []);

  return <section className="card stack" aria-label="Statistiques des campagnes VendreSonCommerce">
    <h2>Campagnes VendreSonCommerce</h2>
    {!summary && !error ? <p>Chargement des statistiques…</p> : null}
    {error ? <p role="alert">Statistiques temporairement indisponibles.</p> : null}
    {summary ? <>
      <p>{summary.campaigns} campagnes — {summary.draft} brouillons — {summary.scheduled} programmés</p>
      <p>{summary.sent} envoyés — {summary.failed} erreurs — {summary.cancelled} annulés</p>
      <p>{summary.replies} réponses enregistrées</p>
      {summary.truncated ? <p className="muted">Résultats partiels : limite de consultation atteinte.</p> : null}
      <p className="muted">Statistiques Atlas uniquement. Aucun envoi n'est déclenché depuis ce tableau.</p>
    </> : null}
  </section>;
}
