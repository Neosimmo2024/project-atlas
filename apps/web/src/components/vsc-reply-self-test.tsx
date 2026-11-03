"use client";
import { useState } from "react";
type Result = { success: boolean; pending: boolean; testId?: string; unsubscribeUrl?: string; message?: string; error?: string };
export function VscReplySelfTest({ initialTestId }: { initialTestId?: string }) {
  const [busy, setBusy] = useState(false); const [started, setStarted] = useState(false); const [result, setResult] = useState<Result | null>(initialTestId ? { success: false, pending: true, testId: initialTestId, message: "Un diagnostic de test existe déjà. Reprendre la vérification ne renverra aucun message." } : null);
  async function run() {
    setBusy(true); setStarted(true);
    try {
      const response = await fetch("/api/admin/vsc-reply-self-test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(result?.pending ? { testId: result.testId } : {}) });
      setResult(await response.json());
    } catch { setResult({ success: false, pending: false, error: "Vérification interrompue. Aucun renvoi automatique : les messages techniques peuvent déjà avoir été envoyés." }); }
    finally { setBusy(false); }
  }
  return <section className="card stack" aria-label="Test complet des réponses OVH">
    <h2>Test technique complet des réponses</h2>
    <p>Deux messages techniques sont adressés uniquement à notre propre boîte contact. Atlas doit reconnaître la réponse et annuler une relance fictive. Aucune campagne commerciale ne sera activée.</p>
    <button type="button" className="button" disabled={busy || (started && !result?.pending)} onClick={() => void run()}>{busy ? "Vérification en cours…" : result?.pending ? "Reprendre la vérification sans renvoyer" : "Tester la réponse et l’arrêt des relances"}</button>
    {result?.success && result.unsubscribeUrl ? <a className="button" href={result.unsubscribeUrl} target="_blank" rel="noreferrer">Vérifier la désinscription du contact fictif</a> : null}
    {result ? <p role={result.success || result.pending ? "status" : "alert"}>{result.message || result.error || "Vérification indisponible."}</p> : null}
  </section>;
}
