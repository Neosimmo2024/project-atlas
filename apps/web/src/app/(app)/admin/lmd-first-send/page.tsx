"use client";

import { useState } from "react";

const interactionId = "6e0c87a7-eae3-4830-84f5-94ac38eb2417";

export default function LmdFirstSendPage() {
  const [status, setStatus] = useState("Prêt à envoyer Laurent Boulay.");
  const [busy, setBusy] = useState(false);

  async function send() {
    if (busy) return;
    setBusy(true);
    setStatus("Envoi en cours...");
    const response = await fetch("/api/admin/lmd-single-send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ interactionId })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus(body.error || "Échec non confirmé.");
      setBusy(false);
      return;
    }
    if (body.data?.duplicatePrevented) {
      setStatus("Doublon évité : cet envoi était déjà confirmé.");
    } else {
      setStatus("Envoyé et confirmé par Brevo.");
    }
    setBusy(false);
  }

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", padding: 24 }}>
      <h1>Validation LMD — premier envoi</h1>
      <p>Destinataire : Laurent Boulay — laurentboulay@lmdimmobilier.fr</p>
      <p>Objet : Laurent, échangeons sur un projet de développement dans votre secteur</p>
      <button onClick={send} disabled={busy} style={{ padding: "12px 18px" }}>
        {busy ? "Envoi..." : "Envoyer le premier email LMD"}
      </button>
      <p style={{ marginTop: 16 }}>{status}</p>
    </main>
  );
}
