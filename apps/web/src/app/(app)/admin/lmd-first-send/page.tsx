"use client";

import { useEffect, useState } from "react";

type Item = {
  interactionId: string;
  displayName: string;
  recipientEmail: string;
  subject: string;
};

export default function LmdRemainingPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [status, setStatus] = useState("Chargement des contacts restants...");

  async function load() {
    const response = await fetch("/api/admin/lmd-remaining", { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus(body.error || "Impossible de charger les contacts.");
      return;
    }
    setItems(body.data ?? []);
    setStatus(`${body.data?.length ?? 0} contact(s) restant(s) dans le groupe A.`);
  }

  useEffect(() => { void load(); }, []);

  async function send(item: Item) {
    if (busyId) return;
    setBusyId(item.interactionId);
    setStatus(`Envoi à ${item.displayName}...`);

    const response = await fetch("/api/admin/lmd-single-send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ interactionId: item.interactionId })
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      setStatus(body.error || `Échec non confirmé pour ${item.displayName}.`);
      setBusyId(null);
      return;
    }

    setStatus(
      body.data?.duplicatePrevented
        ? `Doublon évité pour ${item.displayName}.`
        : `Envoyé et confirmé par Brevo pour ${item.displayName}.`
    );
    setBusyId(null);
    await load();
  }

  return (
    <main style={{ maxWidth: 900, margin: "40px auto", padding: 24 }}>
      <h1>Campagne LMD — groupe A</h1>
      <p>{status}</p>
      <div style={{ display: "grid", gap: 12 }}>
        {items.map((item) => (
          <section key={item.interactionId} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16 }}>
            <strong>{item.displayName}</strong>
            <div>{item.recipientEmail}</div>
            <div style={{ margin: "8px 0" }}>{item.subject}</div>
            <button
              onClick={() => send(item)}
              disabled={busyId !== null}
              style={{ padding: "10px 14px" }}
            >
              {busyId === item.interactionId ? "Envoi..." : "Envoyer"}
            </button>
          </section>
        ))}
      </div>
    </main>
  );
}
