"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RECRUITMENT_EMAIL_STATUS_LABELS } from "@/features/recruitment-email/options";
import type { RecruitmentEmailSequence } from "@/types/domain";

type Props = {
  personId: string;
  email: string | null;
  canContact: boolean;
  canEdit: boolean;
  sequence: RecruitmentEmailSequence | null;
};

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : null;
}

export function RecruitmentEmailSequenceCard({ personId, email, canContact, canEdit, sequence }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function request(method: "POST" | "DELETE") {
    setLoading(true); setMessage(null); setIsError(false);
    try {
      const response = await fetch(`/api/people/${personId}/recruitment-email`, { method });
      const result = await response.json();
      if (!response.ok) { setMessage(result.error ?? "Action impossible."); setIsError(true); router.refresh(); return; }
      setMessage(method === "POST"
        ? result.duplicatePrevented ? "Email déjà envoyé : aucun nouvel envoi effectué." : "Premier email envoyé."
        : "Séquence arrêtée.");
      router.refresh();
    } catch {
      setMessage("Le service est temporairement indisponible."); setIsError(true);
    } finally {
      setLoading(false);
    }
  }

  const canStart = canEdit && Boolean(email) && canContact && (!sequence || sequence.status === "error");
  const canStop = canEdit && sequence && sequence.status !== "stopped";

  return (
    <section className="card stack recruitment-email-card">
      <div className="page-header">
        <div><p className="muted">Séquence de recrutement</p><h2>Premier email Brevo</h2></div>
        <span className="status-pill">{RECRUITMENT_EMAIL_STATUS_LABELS[sequence?.status ?? "none"]}</span>
      </div>
      <p><strong>Adresse utilisée</strong><br />{sequence?.email ?? email ?? "Aucune adresse email principale"}</p>
      {sequence?.sent_at ? <p><strong>Envoyé le</strong><br />{formatDate(sequence.sent_at)}</p> : null}
      {sequence?.provider_message_id ? <p className="muted">Identifiant Brevo : {sequence.provider_message_id}</p> : null}
      {sequence?.last_error ? <p className="error">Dernière erreur : {sequence.last_error}</p> : null}
      {!email ? <p className="error">Ajoute une adresse email principale avant de démarrer la séquence.</p> : null}
      {email && !canContact ? <p className="error">Le contact n’est pas autorisé pour cette personne.</p> : null}
      {message ? <p aria-live="polite" className={isError ? "error" : "success"}>{message}</p> : null}
      {canEdit ? <div className="actions">
        {canStart ? <Button type="button" disabled={loading} onClick={() => request("POST")}>{sequence?.status === "error" ? "Réessayer l’envoi" : "Démarrer et envoyer le premier email"}</Button> : null}
        {canStop ? <Button type="button" variant="subtle" disabled={loading} onClick={() => request("DELETE")}>Arrêter la séquence</Button> : null}
      </div> : <p className="muted">Votre rôle permet la consultation, mais pas la modification.</p>}
    </section>
  );
}
