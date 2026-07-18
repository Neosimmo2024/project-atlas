import { PROJECT_STAGE_LABELS, PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS } from "@/features/projects/options";
import type { Project, ProjectStage, ProjectStatus, ProjectType } from "@/types/domain";

export function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(value));
}

export function formatDateTime(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function formatMoney(value: string | null, currency: string) {
  if (!value) return "-";
  return `${value} ${currency}`;
}

export function projectTypeLabel(value: ProjectType) {
  return PROJECT_TYPE_LABELS[value] ?? value;
}

export function projectStatusLabel(value: ProjectStatus) {
  return PROJECT_STATUS_LABELS[value] ?? value;
}

export function projectStageLabel(value: ProjectStage) {
  return PROJECT_STAGE_LABELS[value] ?? value;
}

export function projectSignals(project: Pick<Project, "status" | "archived_at" | "expected_close_at">, hasNextAction: boolean, nextActionReason?: string | null) {
  const signals: string[] = [];
  if (project.archived_at) signals.push("Projet archive");
  if (project.status === "won") signals.push("Projet gagne");
  if (project.status === "lost") signals.push("Projet perdu");
  if (nextActionReason === "overdue") signals.push("Action en retard");
  if (project.status === "open" && !hasNextAction) signals.push("Aucune action planifiee");
  if (project.expected_close_at) {
    const due = new Date(project.expected_close_at);
    const now = new Date();
    const soon = new Date();
    soon.setDate(now.getDate() + 14);
    if (due >= now && due <= soon) signals.push("Cloture prevue prochainement");
  }
  return signals;
}
