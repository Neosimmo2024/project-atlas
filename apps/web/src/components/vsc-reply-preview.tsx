"use client";

import { useState } from "react";

type Preview = { dryRun: boolean; inspected: number; matched: number };

export function VscReplyPreview() {
  const [syncResult, setSyncResult] = useState<{ inspected: number; matched: number; recorded: number; hasMore: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function inspect() {
    setBusy(true);
    setSyncResult(null);
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

  async function synchronize() {
    setBusy(true);
    setError(null);
    setSyncResult(null);
    setResult(null);
    try {
      const response = await fetch("/api/admin/vsc-reply-sync", { method: "POST" });
      if (!response.ok) throw new Error("Traitement indisponible");
      setSyncResult(await response.json());
    } catch {
      setError("Traitement interrompu. Vous pouvez reprendre sans renvoyer de message.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="card stack" aria-label="Inspection des réponses VendreSonCommerce">
    <h2>Réponses aux campagnes</h2>
    <p>Analyse manuelle en lecture seule. Aucun email envoyé et aucune relance annulée.</p>
    <button type="button" className="button" onClick={() => void inspect()} disabled={busy}>
      {busy ? "Inspection en cours…" : "Vérifier les réponses OVH"}
    </button>
    {result ? <p role="status">{result.inspected} messages examinés, {result.matched} réponses reconnues. Aucun changement effectué.</p> : null}
    <p>Le traitement enregistre les réponses reconnues et arrête les relances concernées. Aucun message n’est envoyé.</p>
    <button type="button" className="button" onClick={() => void synchronize()} disabled={busy}>
      {busy ? "Opération en cours…" : syncResult?.hasMore ? "Traiter le lot suivant" : "Traiter les réponses et arrêter les relances"}
    </button>
    {syncResult ? <p role="status">{syncResult.inspected} messages examinés, {syncResult.matched} réponses reconnues, {syncResult.recorded} nouvelles réponses enregistrées.
      {syncResult.hasMore ? " D’autres messages restent à traiter." : " Lecture terminée pour ce lot."}</p> : null}
    {error ? <p role="alert">{error}</p> : null}
  </section>;
}
