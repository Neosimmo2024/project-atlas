"use client";
import { useState } from "react";
type Status = { configured: boolean; enabled: boolean; lastSync: string | null; lastError: string | null; processed: number; remaining?: number | null };
export function MailboxConnection({ initial }: { initial: Status }) {
  const [status, setStatus] = useState(initial);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function act(action: "connect" | "sync" | "pause") {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/mailbox", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...(action === "connect" ? { password } : {}) }) });
      const data = await response.json();
      setPassword("");
      if (!response.ok) throw new Error(data.error);
      setMessage(data.message ?? `Synchronisation terminée : ${data.result.processed} réponse(s) enregistrée(s), ${data.result.stopped} séquence(s) arrêtée(s).${data.result.remaining ? " D’autres messages seront analysés au prochain passage." : ""}`);
      const state = await fetch("/api/admin/mailbox", { cache: "no-store" });
      if (state.ok) setStatus(await state.json());
    } catch (error) { setMessage(error instanceof Error ? error.message : "Connexion indisponible."); }
    finally { setBusy(false); }
  }
  return <section className="card stack">
    <h2>Connexion à votre boîte PlanetHoster</h2>
    <p><strong>renato.ponzio@neos-immo.com</strong> — {status.enabled ? "Lecture automatique activée" : status.configured ? "Lecture suspendue" : "À connecter"}</p>
    <p>Les réponses aux emails suivis dans Atlas sont rattachées aux fiches. Une réponse humaine arrête les relances et crée une tâche de suivi. Vos messages restent dans Outlook.</p>
    <p>Seule la boîte de réception est analysée. Les messages sans lien avec un envoi enregistré, les réponses automatiques et les pièces jointes ne sont pas importés.</p>
    <form onSubmit={event => { event.preventDefault(); void act("connect"); }} className="stack">
      <label htmlFor="mailbox-password">Mot de passe de cette boîte email</label>
      <input id="mailbox-password" type="password" autoComplete="new-password" value={password}
        onChange={event => setPassword(event.target.value)} required maxLength={1024} disabled={busy} />
      <p>Le mot de passe est conservé chiffré côté serveur. Il n’est jamais affiché après l’enregistrement.</p>
      <button className="button" disabled={busy || !password}>{busy ? "Vérification…" : status.configured ? "Vérifier et reconnecter" : "Connecter ma boîte"}</button>
    </form>
    {status.enabled && <div><button className="button subtle-button" disabled={busy} onClick={() => void act("sync")}>Rechercher les réponses maintenant</button>{" "}
      <button className="button subtle-button" disabled={busy} onClick={() => void act("pause")}>Suspendre la lecture</button></div>}
    <p>Dernière synchronisation : {status.lastSync ? new Date(status.lastSync).toLocaleString("fr-FR", { timeZone: "Europe/Paris" }) : "Pas encore effectuée"}. Réponses enregistrées : {status.processed}.</p>
    {status.remaining != null && <p>{status.remaining > 0 ? `Historique en cours : ${status.remaining} message(s) restant(s). Les nouveaux messages sont vérifiés en priorité.` : "Historique analysé. Le contrôle des réponses est à jour."}</p>}
    {status.lastError && <p role="alert">{status.lastError}</p>}
    <p role="status" aria-live="polite">{message}</p>
  </section>;
}
