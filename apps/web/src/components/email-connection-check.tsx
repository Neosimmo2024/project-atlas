"use client";

import { useState } from "react";

export function EmailConnectionCheck({ configured }: { configured: boolean }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  async function checkConnection(mode: "connection" | "test" | "reply" = "connection") {
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch(mode === "connection" ? "/api/admin/email-connection" : `/api/admin/email-connection/${mode}`, { method: "POST" });
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
    <button className="button" type="button" disabled={!configured || busy} onClick={() => checkConnection("test")}>
      {busy ? "Traitement en cours…" : "Envoyer le test à mon adresse Gmail"}
    </button>
    <hr />
    <h2>Vérifier les réponses</h2>
    <p>Répondez « Bien reçu » au dernier mail de test avec le logo, puis vérifiez ici que votre réponse est arrivée dans la boîte contact.</p>
    <button className="button" type="button" disabled={!configured || busy} onClick={() => checkConnection("reply")}>
      {busy ? "Vérification en cours…" : "Vérifier ma réponse au test"}
    </button>
    {result ? <p role={result.success ? "status" : "alert"}>{result.message}</p> : null}
  </section>;
}
