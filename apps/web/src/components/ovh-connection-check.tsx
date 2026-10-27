"use client";
import { useState } from "react";
export function OvhConnectionCheck({ configured }: { configured: boolean }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  async function check() {
    setBusy(true); setResult(null);
    try {
      const response = await fetch("/api/admin/ovh-connection", { method: "POST" });
      const data = await response.json() as { success?: boolean; message?: string; error?: string };
      setResult({ success: response.ok && data.success === true, message: data.message || data.error || "La vérification a échoué." });
    } catch { setResult({ success: false, message: "La vérification a échoué. Veuillez réessayer." }); }
    finally { setBusy(false); }
  }
  return <section className="card stack" aria-label="Vérification OVH">
    <p>{configured ? "Les identifiants sont renseignés. Vous pouvez vérifier la connexion." : "Le mot de passe de la boîte contact doit encore être renseigné dans la configuration sécurisée du serveur."}</p>
    <button className="button" type="button" disabled={!configured || busy} onClick={check}>{busy ? "Vérification en cours…" : "Vérifier la connexion OVH"}</button>
    <p className="muted">Ce contrôle n’envoie aucun email et n’active aucune campagne.</p>
    {result ? <p role={result.success ? "status" : "alert"}>{result.message}</p> : null}
  </section>;
}
