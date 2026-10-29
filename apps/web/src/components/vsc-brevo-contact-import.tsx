"use client";
import { useState } from "react";
import type { previewVscBrevoContactImport, VscBrevoImportTotals } from "@/services/vsc-brevo-contact-import";
type Preview = Awaited<ReturnType<typeof previewVscBrevoContactImport>>;
export function VscBrevoContactImport() {
  const [preview, setPreview] = useState<Preview | null>(null), [result, setResult] = useState<VscBrevoImportTotals | null>(null);
  const [busy, setBusy] = useState<"preview" | "import" | null>(null), [error, setError] = useState("");
  async function prepare() {
    setBusy("preview"); setError(""); setPreview(null); setResult(null);
    try {
      const response = await fetch("/api/admin/vsc-brevo-contacts", { cache: "no-store" });
      const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Rapprochement indisponible");
      setPreview(data);
    } catch (error) { setError(error instanceof Error ? error.message : "Rapprochement indisponible"); }
    finally { setBusy(null); }
  }
  async function importContacts() {
    if (!preview) return;
    setBusy("import"); setError(""); setResult(null);
    try {
      const response = await fetch("/api/admin/vsc-brevo-contacts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reviewKey: preview.reviewKey }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Import interrompu");
      setResult(data); setPreview(null);
    } catch (error) {
      setPreview(null); setError(error instanceof Error ? error.message : "Import interrompu. Rechargez l’aperçu avant de reprendre.");
    } finally { setBusy(null); }
  }
  return <section className="card stack" aria-label="Rapprochement des contacts Brevo VSC">
    <h2>Rapprocher les contacts Brevo VSC</h2>
    <p>Import du compte Brevo VendreSonCommerce vers l’espace VSC de cette prévisualisation Atlas. Aucune campagne, livraison, réinscription Brevo ou envoi n’est créé.</p>
    <p>Les exclusions email et SMS sont conservées, y compris entre doublons. Un blocage ou une autorisation refusée déjà présent dans Atlas n’est jamais levé par l’import. Les numéros fixes sont conservés comme coordonnées, sans devenir des destinataires SMS.</p>
    <p>Les comptes et données NEOS IMMO restent hors de cet import.</p>
    <button type="button" className="button" disabled={busy !== null} onClick={() => void prepare()}>{busy === "preview" ? "Lecture et rapprochement…" : "Analyser les contacts Brevo VSC"}</button>
    {preview ? <div className="stack" role="status">
      <h3>Aperçu de l’import VSC</h3>
      <p>{preview.summary.sourceContacts} contacts Brevo — {preview.summary.groupedRecords} fiches regroupées — {preview.summary.duplicateRecords} doublons regroupés</p>
      <p>{preview.summary.withUsableCoordinates} fiches avec coordonnées non ambiguës — {preview.summary.withoutCoordinates} sans coordonnées exploitables — {preview.summary.sourceConflicts} conflits à vérifier</p>
      <p>{preview.summary.sourceEmailBlocked} exclusions email sources — {preview.summary.sourceSmsBlocked} exclusions SMS sources — {preview.summary.sourceGlobalBlocked} oppositions globales</p>
      <p>{preview.summary.emailCandidates} candidats email et {preview.summary.smsCandidates} candidats SMS français avant les contrôles Atlas ; {preview.summary.nonMobilePhones} fiches avec numéro fixe ou autre numéro non proposé aux SMS français.</p>
      <p>{preview.summary.existingAtlasContacts} contacts déjà présents dans Atlas VSC — {preview.summary.existingSourceLinks} identités Brevo déjà rapprochées</p>
      <p>{preview.coordinateAudit.phoneFields} champs téléphone reçus de Brevo.</p>
      {preview.coordinateAudit.rejectedPhoneFormats.map(item => <p key={item.format}>{item.count} téléphones non normalisés, format masqué : {item.format}</p>)}
      {preview.coordinateAudit.numericEmailDomains.map(item => <p key={item.domain}>{item.count} identifiants email à partie numérique sur le domaine {item.domain} : leur nature doit être vérifiée avant utilisation.</p>)}
      {preview.summary.missingStatuses > 0 ? <p>{preview.summary.missingStatuses} contacts ont un statut de canal incomplet : le canal inconnu sera bloqué.</p> : null}
      <h4>Listes sources</h4>
      <ul>{preview.lists.map(list => <li key={list.id}>#{list.id} {list.name} — {list.contacts} contacts, {list.emailBlocked} exclusions email, {list.smsBlocked} exclusions SMS</li>)}</ul>
      <p className="muted">Un contact peut appartenir à plusieurs listes. Les adresses email techniques de Brevo pour les contacts SMS ne sont pas importées comme adresses email réelles.</p>
      <p>Les nouveaux contacts reprennent les canaux disponibles et non bloqués dans Brevo. Les fiches existantes conservent leur autorisation Atlas. Les contradictions d’identité sont signalées, sans fusion ni écrasement automatique.</p>
      <button type="button" className="button" disabled={busy !== null || preview.summary.sourceContacts === 0} onClick={() => void importContacts()}>{busy === "import" ? "Import en cours…" : "Importer les contacts et exclusions VSC"}</button>
    </div> : null}
    {error ? <p role="alert">{error}</p> : null}
    {result ? <div className="stack" role="status">
      <h3>Import VSC terminé</h3>
      <p>{result.sourceContacts} identités Brevo traitées — {result.created} fiches créées — {result.matched} fiches rapprochées</p>
      <p>{result.conflicts} conflits à vérifier — {result.withoutCoordinates} fiches sans coordonnées exploitables</p>
      <p>{result.cancelled} relances VSC en attente annulées selon les exclusions importées. Aucun nouvel envoi ni nouvelle livraison créé.</p>
      <p>Rechargez la page pour actualiser les contacts proposés et les versions enregistrées. L’historique des campagnes Brevo déjà envoyées reste à prendre en compte avant tout futur lancement.</p>
    </div> : null}
    <p className="muted">Un aperçu périmé est refusé. En cas d’interruption, rechargez l’aperçu puis reprenez : les identités Brevo déjà rapprochées ne créent pas de doublons.</p>
  </section>;
}
