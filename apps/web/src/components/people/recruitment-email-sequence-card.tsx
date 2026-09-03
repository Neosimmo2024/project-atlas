"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { RecruitmentEmailSequenceStep, RecruitmentEmailSequenceWithSteps } from "@/repositories/recruitment-email-sequences";

type Props = {
  personId: string;
  email: string | null;
  canContact: boolean;
  canEdit: boolean;
  sequence: RecruitmentEmailSequenceWithSteps | null;
};

const lifecycleLabels = {
  idle: "En attente",
  scheduled: "Programmée",
  running: "En cours",
  completed: "Terminée",
  stopped: "Arrêtée",
  error: "Erreur"
} as const;

const stepLabels = ["Email initial", "Relance J+3", "Relance J+7"] as const;
const stepStatusLabels = {
  scheduled: "Programmée",
  processing: "En cours",
  sent: "Envoyée",
  error: "Erreur",
  cancelled: "Annulée"
} as const;

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(value)) : null;
}

function stepFor(sequence: RecruitmentEmailSequenceWithSteps | null, index: number): RecruitmentEmailSequenceStep | null {
  return sequence?.steps.find((step) => step.step_index === index) ?? null;
}

function stepStatus(step: RecruitmentEmailSequenceStep | null, sequence: RecruitmentEmailSequenceWithSteps | null, index: number) {
  if (step) return stepStatusLabels[step.status];
  if (!sequence) return "Non démarrée";
  if (sequence.lifecycle_status === "stopped") return "Non envoyée";
  if (sequence.lifecycle_status === "completed") return "Terminée";
  return index > sequence.current_step ? "À venir" : "En attente";
}

function stopReasonLabel(reason: string | null) {
  if (!reason) return null;
  if (reason === "contact_not_allowed") return "Contact non autorisé";
  if (reason === "do_not_contact") return "Ne pas contacter";
  if (reason === "manual_stop") return "Arrêt manuel";
  if (reason === "legacy_stop") return "Séquence précédemment arrêtée";
  return reason.replaceAll("_", " ");
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

  const lifecycle = sequence?.lifecycle_status ?? null;
  const canStart = canEdit && Boolean(email) && canContact && (!sequence || sequence.status === "error");
  const canStop = canEdit && Boolean(sequence) && lifecycle !== "stopped" && lifecycle !== "completed";
  const sentSteps = sequence?.steps.filter((step) => step.status === "sent").sort((a, b) => b.step_index - a.step_index) ?? [];
  const lastSent = sentSteps[0] ?? null;
  const stopReason = stopReasonLabel(sequence?.stop_reason ?? null);

  return (
    <section className="card stack recruitment-email-card">
      <div className="page-header">
        <div><p className="muted">Séquence de recrutement</p><h2>Email initial + relances</h2></div>
        <span className="status-pill">{lifecycle ? lifecycleLabels[lifecycle] : "Inactive"}</span>
      </div>

      <div className="grid">
        <p><strong>Adresse utilisée</strong><br />{sequence?.email ?? email ?? "Aucune adresse email principale"}</p>
        <p><strong>Dernier email envoyé</strong><br />{lastSent?.sent_at ? `${stepLabels[lastSent.step_index]} · ${formatDate(lastSent.sent_at)}` : sequence?.sent_at ? `Email initial · ${formatDate(sequence.sent_at)}` : "Aucun"}</p>
        <p><strong>Prochaine action</strong><br />{sequence?.next_action_at ? `${sequence.current_step === 1 ? "Relance J+3" : sequence.current_step === 2 ? "Relance J+7" : "Action programmée"} · ${formatDate(sequence.next_action_at)}` : "Aucune action programmée"}</p>
      </div>

      {stopReason ? <p className="warning"><strong>Raison de l’arrêt :</strong> {stopReason}</p> : null}
      {sequence?.last_error ? <p className="error">Dernière erreur : {sequence.last_error}</p> : null}

      <div className="stack" aria-label="Étapes de la séquence email">
        {stepLabels.map((label, index) => {
          const step = stepFor(sequence, index);
          const date = step?.sent_at ?? step?.scheduled_at ?? null;
          return (
            <div className="pipeline-meta-row" key={label}>
              <span className="pipeline-meta-label"><strong>{index + 1}. {label}</strong>{date ? ` · ${formatDate(date)}` : ""}</span>
              <span className="status-pill">{stepStatus(step, sequence, index)}</span>
            </div>
          );
        })}
      </div>

      {sequence?.provider_message_id ? <p className="muted">Identifiant Brevo initial : {sequence.provider_message_id}</p> : null}
      {!email ? <p className="error">Ajoute une adresse email principale avant de démarrer la séquence.</p> : null}
      {email && !canContact ? <p className="error">Le contact n’est pas autorisé pour cette personne. La séquence ne peut pas être démarrée ou poursuivie.</p> : null}
      {message ? <p aria-live="polite" className={isError ? "error" : "success"}>{message}</p> : null}
      {canEdit ? <div className="actions">
        {canStart ? <Button type="button" disabled={loading} onClick={() => request("POST")}>{sequence?.status === "error" ? "Réessayer l’envoi" : "Démarrer la séquence"}</Button> : null}
        {canStop ? <Button type="button" variant="subtle" disabled={loading} onClick={() => request("DELETE")}>Arrêter la séquence</Button> : null}
      </div> : <p className="muted">Votre rôle permet la consultation, mais pas la modification.</p>}
    </section>
  );
}
