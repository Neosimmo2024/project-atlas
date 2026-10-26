"use client";

import { useState } from "react";

export function EmailConnectionCheck({ configured }: { configured: boolean }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  async function checkConnection(test = false) {
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch(test ? "/api/admin/email-connection/test" : "/api/admin/email-connection", { method: "POST" });
      const data = await response.json() as { success?: boolean; message?: string; error?: string };
      setResult({ success: response.ok && data.success === true,
        message: data.message || data.error || "La vérification a échoué." });
    } catch {
      setResult({ success: false, message: "La vérification a échoué. Veuillez réessayer." });
    } finally {
      setBusy(false);
    }
  }

  return <section className="card stack" aria-label="Vérification IONOS">
    <p>{configured ? "Les identifiants sont renseignés. Vous pouvez vérifier la connexion." : "Les identifiants doivent encore être renseignés dans la configuration sécurisée du serveur."}</p>
    <button className="button" type="button" disabled={!configured || busy} onClick={() => checkConnection()}>
      {busy ? "Vérification en cours…" : "Vérifier la connexion"}
    </button>
    <p className="muted">Ce contrôle n’envoie aucun email et n’active aucune campagne.</p>
    <hr />
    <h2>Tester la réception d’un email</h2>
    <p>Un seul message technique sera envoyé à renatoponzio@gmail.com depuis contact@lesformateursimmo.com. Ce test n’active aucune campagne.</p>
    <button className="button" type="button" disabled={!configured || busy} onClick={() => checkConnection(true)}>
      {busy ? "Traitement en cours…" : "Envoyer le test à mon adresse Gmail"}
    </button>
    {result ? <p role={result.success ? "status" : "alert"}>{result.message}</p> : null}
  </section>;
}
