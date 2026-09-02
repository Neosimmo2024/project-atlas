"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  buildRecruitmentEmailHtml,
  DEFAULT_RECRUITMENT_EMAIL_TEMPLATE,
  templateInputFromVersion,
  type RecruitmentEmailTemplateInput
} from "@/features/recruitment-email-template/model";
import type { RecruitmentEmailTemplateVersionSummary } from "@/types/domain";

type Message = { type: "success" | "error"; text: string } | null;

const statusLabels = {
  draft: "Brouillon",
  synced: "Synchronisée",
  active: "Active",
  error: "Erreur"
} as const;

const versionDateFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

function statusTone(status: RecruitmentEmailTemplateVersionSummary["status"]): "success" | "warning" | "neutral" | "info" {
  if (status === "active") return "success";
  if (status === "error") return "warning";
  if (status === "synced") return "info";
  return "neutral";
}

export function RecruitmentEmailTemplateManager({ initialVersions }: { initialVersions: RecruitmentEmailTemplateVersionSummary[] }) {
  const [versions, setVersions] = useState(initialVersions);
  const [form, setForm] = useState<RecruitmentEmailTemplateInput>(() =>
    initialVersions[0] ? templateInputFromVersion(initialVersions[0]) : DEFAULT_RECRUITMENT_EMAIL_TEMPLATE
  );
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");
  const [saving, setSaving] = useState(false);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);

  const previewHtml = useMemo(() => buildRecruitmentEmailHtml(form), [form]);

  function update<K extends keyof RecruitmentEmailTemplateInput>(field: K, value: RecruitmentEmailTemplateInput[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function reloadVersions() {
    const response = await fetch("/api/admin/recruitment-email-template", { headers: { Accept: "application/json" } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error ?? "Impossible de recharger les versions.");
    setVersions(payload.data ?? []);
  }

  async function saveVersion(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/recruitment-email-template", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "L’enregistrement a échoué.");
      await reloadVersions();
      setMessage({ type: "success", text: `Version ${payload.data.version_number} enregistrée. Aucun email n’a été envoyé.` });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "L’enregistrement a échoué." });
    } finally {
      setSaving(false);
    }
  }

  async function activate(versionId: string) {
    setActivatingId(versionId);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/recruitment-email-template/${encodeURIComponent(versionId)}/activate`, {
        method: "POST",
        headers: { Accept: "application/json" }
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "La synchronisation Brevo a échoué.");
      await reloadVersions();
      setMessage({ type: "success", text: `Version ${payload.data.version_number} synchronisée et activée dans Brevo. Aucun email n’a été envoyé.` });
    } catch (error) {
      await reloadVersions().catch(() => undefined);
      setMessage({ type: "error", text: error instanceof Error ? error.message : "La synchronisation Brevo a échoué." });
    } finally {
      setActivatingId(null);
    }
  }

  function loadVersion(version: RecruitmentEmailTemplateVersionSummary) {
    setForm(templateInputFromVersion(version));
    setMessage({ type: "success", text: `Version ${version.version_number} chargée dans l’éditeur. Enregistrez pour créer une nouvelle version.` });
  }

  return (
    <div className="template-manager">
      <Card className="template-safety-banner">
        <div>
          <strong>Mode administration sans envoi</strong>
          <p>Enregistrer crée une version locale. Synchroniser crée uniquement le modèle dans Brevo.</p>
        </div>
        <Badge tone="info">Aucun destinataire</Badge>
      </Card>

      {message ? (
        <p className={message.type === "success" ? "form-message success" : "form-message error"} role={message.type === "error" ? "alert" : "status"}>
          {message.text}
        </p>
      ) : null}

      <div className="template-editor-layout">
        <form className="card template-form" onSubmit={saveVersion}>
          <div className="template-section-heading">
            <div><p className="muted">Contenu</p><h2>Éditeur du premier email</h2></div>
            <span className="template-variable-hint">Variable autorisée : {"{{ params.PRENOM }}"}</span>
          </div>

          <label>Nom interne<input className="input" value={form.templateName} onChange={(event) => update("templateName", event.target.value)} required maxLength={120} /></label>
          <label>Objet<input className="input" value={form.subject} onChange={(event) => update("subject", event.target.value)} required maxLength={200} /></label>
          <label>Texte d’aperçu<input className="input" value={form.previewText} onChange={(event) => update("previewText", event.target.value)} maxLength={200} /></label>
          <label>Titre dans l’email<input className="input" value={form.headline} onChange={(event) => update("headline", event.target.value)} required maxLength={200} /></label>
          <label>Message<textarea className="input template-body-field" value={form.bodyText} onChange={(event) => update("bodyText", event.target.value)} required rows={15} /></label>

          <Card>
            <strong>Signature permanente NEOS</strong>
            <p className="muted">La signature Renato Ponzio et le logo officiel NEOS sont ajoutés automatiquement à tous les modèles.</p>
          </Card>

          <div className="template-form-grid">
            <label>Nom de l’expéditeur<input className="input" value={form.senderName} onChange={(event) => update("senderName", event.target.value)} required /></label>
            <label>Email de l’expéditeur<input className="input" type="email" value={form.senderEmail} onChange={(event) => update("senderEmail", event.target.value)} required /></label>
            <label>Email de réponse<input className="input" type="email" value={form.replyTo} onChange={(event) => update("replyTo", event.target.value)} /></label>
            <label>Couleur NEOS<input className="input template-color-input" type="color" value={form.brandColor} onChange={(event) => update("brandColor", event.target.value.toUpperCase())} /></label>
          </div>

          <div className="template-form-actions">
            <Button type="submit" disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer une nouvelle version"}</Button>
            <span>Aucune synchronisation et aucun envoi à cette étape.</span>
          </div>
        </form>

        <section className="template-preview-panel" aria-label="Aperçu du modèle">
          <div className="template-preview-toolbar">
            <div><p className="muted">Aperçu sécurisé</p><strong>{previewDevice === "desktop" ? "Ordinateur" : "Mobile"}</strong></div>
            <div className="template-device-toggle" role="group" aria-label="Taille de l’aperçu">
              <Button type="button" variant={previewDevice === "desktop" ? "primary" : "subtle"} onClick={() => setPreviewDevice("desktop")}>Ordinateur</Button>
              <Button type="button" variant={previewDevice === "mobile" ? "primary" : "subtle"} onClick={() => setPreviewDevice("mobile")}>Mobile</Button>
            </div>
          </div>
          <div className={`template-preview-frame ${previewDevice}`}>
            <iframe title="Aperçu du premier email de recrutement" sandbox="allow-same-origin" srcDoc={previewHtml.replaceAll("{{ params.PRENOM }}", "Camille")} />
          </div>
        </section>
      </div>

      <section className="template-history stack" aria-labelledby="template-history-title">
        <div className="template-section-heading">
          <div><p className="muted">Historique immuable</p><h2 id="template-history-title">Versions enregistrées</h2></div>
          <Badge>{versions.length} version{versions.length > 1 ? "s" : ""}</Badge>
        </div>
        {versions.length === 0 ? <Card><p>Aucune version enregistrée. Commencez par enregistrer le modèle ci-dessus.</p></Card> : null}
        <div className="template-version-list">
          {versions.map((version) => (
            <Card as="article" className="template-version-card" key={version.id}>
              <div>
                <div className="template-version-title"><h3>Version {version.version_number}</h3><Badge tone={statusTone(version.status)}>{statusLabels[version.status]}</Badge></div>
                <p>{version.template_name}</p>
                <small>Créée le {versionDateFormatter.format(new Date(version.created_at))}</small>
                {version.brevo_template_id ? <small>Identifiant Brevo : {version.brevo_template_id}</small> : null}
                {version.last_sync_error ? <p className="template-sync-error">{version.last_sync_error}</p> : null}
              </div>
              <div className="template-version-actions">
                <Button type="button" variant="subtle" onClick={() => loadVersion(version)}>Charger dans l’éditeur</Button>
                <Button type="button" disabled={activatingId !== null || version.status === "active"} onClick={() => activate(version.id)}>
                  {activatingId === version.id ? "Synchronisation…" : version.status === "active" ? "Version active" : "Synchroniser et activer"}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
