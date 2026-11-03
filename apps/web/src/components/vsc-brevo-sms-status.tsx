"use client";
import { useState } from "react";
import type { VscBrevoSmsStatus as Status } from "@/services/vsc-brevo-sms-status";
const labels: Record<Status["state"], string> = {
  missing_key: "La clé API dédiée VendreSonCommerce n’est pas configurée dans Atlas.",
  identity_verified: "La clé dédiée correspond à contact@vendresoncommerce.com. Ce contrôle d’identité ne vérifie pas la séparation des listes et campagnes.",
  identity_mismatch: "La clé dédiée ne correspond pas au compte contact@vendresoncommerce.com. Le raccordement doit être corrigé.",
  unavailable: "Brevo n’a pas permis de vérifier le compte. Aucune modification effectuée."
};
export function VscBrevoSmsStatus() {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  return <section className="card stack" aria-label="Connexion SMS Brevo VendreSonCommerce">
    <h2>Connexion SMS Brevo VendreSonCommerce</h2>
    <p>Contrôle de l’identité du compte avec la clé dédiée VSC. Aucun SMS, contact ou campagne n’est créé ou modifié. Les envois SMS restent désactivés.</p>
    <button type="button" className="button" disabled={busy} onClick={() => {
      setBusy(true); setMessage("");
      void fetch("/api/admin/vsc-brevo-sms-status", { cache: "no-store" }).then(async response => {
        if (!response.ok) throw new Error();
        const result = await response.json() as Status;
        setMessage(labels[result.state] ?? "Réponse de vérification indisponible.");
      }).catch(() => setMessage("Vérification temporairement indisponible.")).finally(() => setBusy(false));
    }}>{busy ? "Vérification…" : "Vérifier le compte SMS VSC"}</button>
    {message ? <p role="status">{message}</p> : null}
  </section>;
}
