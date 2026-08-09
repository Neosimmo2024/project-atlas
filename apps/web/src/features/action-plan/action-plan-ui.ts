import type { ActionPlanCategory, ActionPlanItem, ActionPlanReason, ActionPlanSourceType } from "@/types/domain";

export const ACTION_PLAN_CATEGORY_LABELS: Record<ActionPlanCategory, string> = {
  critical: "Critique",
  priority: "Prioritaire",
  opportunity: "Opportunité",
  to_schedule: "À planifier"
};

export const ACTION_PLAN_CATEGORY_DESCRIPTIONS: Record<ActionPlanCategory, string> = {
  critical: "À traiter en premier pour éviter une perte d’opportunité.",
  priority: "Actions importantes à suivre rapidement.",
  opportunity: "Signaux utiles pour relancer ou renforcer une relation.",
  to_schedule: "Actions pertinentes sans échéance claire."
};

export const ACTION_PLAN_SOURCE_LABELS: Record<ActionPlanSourceType, string> = {
  task: "Tâche",
  relationship_recommendation: "Relation"
};

export function actionPlanReasonLabel(reason: ActionPlanReason) {
  switch (reason.code) {
    case "TASK_OVERDUE_GT_24H":
      return `Échéance dépassée depuis ${hoursLabel(reason.metadata?.overdueHours)}.`;
    case "TASK_OVERDUE_LT_24H":
      return `Échéance dépassée depuis moins de 24 h${hoursSuffix(reason.metadata?.overdueHours)}.`;
    case "DUE_TODAY":
      return "Échéance prévue aujourd’hui.";
    case "HIGH_PRIORITY":
      return "Priorité élevée.";
    case "MEDIUM_PRIORITY":
      return "Priorité normale.";
    case "SNOOZED":
      return `Action déjà reportée${countSuffix(reason.metadata?.snoozeCount)}.`;
    case "SNOOZED_MULTIPLE_TIMES":
      return `Action reportée plusieurs fois${countSuffix(reason.metadata?.snoozeCount)}.`;
    case "RELATIONSHIP_INACTIVE_14D":
      return `Relation inactive depuis ${daysLabel(reason.metadata?.inactiveDays)}.`;
    case "RELATIONSHIP_INACTIVE_30D":
      return `Relation inactive depuis ${daysLabel(reason.metadata?.inactiveDays)}.`;
    case "IMPORTANT_WITHOUT_DUE_DATE":
      return "Tâche importante sans échéance définie.";
    default:
      return exhaustiveReason(reason.code);
  }
}

export function actionPlanItemHref(item: ActionPlanItem) {
  if (item.sourceType === "task") return `/tasks/${item.sourceId}`;
  if (item.sourceType === "relationship_recommendation") return `/relationships/${item.sourceId}`;
  return null;
}

export function actionPlanItemLinkLabel(item: ActionPlanItem) {
  if (item.sourceType === "task") return "Ouvrir la tâche";
  if (item.sourceType === "relationship_recommendation") return "Ouvrir la relation";
  return "Ouvrir";
}

export function formatActionPlanDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Paris"
  }).format(date);
}

function hoursLabel(value: unknown) {
  const hours = typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
  if (hours === null) return "plus de 24 h";
  return `${hours} h`;
}

function hoursSuffix(value: unknown) {
  const hours = typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
  return hours === null ? "" : ` (${hours} h)`;
}

function daysLabel(value: unknown) {
  const days = typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
  if (days === null) return "plusieurs jours";
  return `${days} jour${days > 1 ? "s" : ""}`;
}

function countSuffix(value: unknown) {
  const count = typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
  if (!count) return "";
  return ` (${count} fois)`;
}

function exhaustiveReason(code: never): string {
  return code;
}
