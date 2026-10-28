"use client";

import { useState } from "react";

type Preview = { dryRun: boolean; inspected: number; matched: number };

export function VscReplyPreview() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function inspect() {
    setBusy(true);
    setResult(null);
    setError(null);
    try {
      const response = await fetch("/api/admin/vsc-reply-preview", { method: "POST" });
      const data = await response.json() as Preview & { error?: string };
      if (!response.ok || data.dryRun !== true) throw new Error(data.error ?? "Inspection impossible");
      setResult(data);
    } catch {
      setError("Impossible d'inspecter les réponses OVH pour le moment.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="card stack" aria-label="Inspection des réponses VendreSonCommerce">
    <h2>Réponses aux campagnes — simulation</h2>
    <p>Analyse manuelle en lecture seule. Aucun email envoyé et aucune relance annulée.</p>
    <button type="button" className="button" onClick={() => void inspect()} disabled={busy}>
      {busy ? "Inspection en cours…" : "Vérifier les réponses OVH"}
    </button>
    {result ? <p role="status">{result.inspected} messages examinés, {result.matched} réponses reconnues. Aucun changement effectué.</p> : null}
    {error ? <p role="alert">{error}</p> : null}
  </section>;
}
