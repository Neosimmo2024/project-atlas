import type { ActionPlanCategory, ActionPlanItem, ActionPlanReasonCode } from "@/types/domain";

export const ACTION_PLAN_CATEGORY_LABELS: Record<ActionPlanCategory, string> = {
  critical: "Critique",
  priority: "Prioritaire",
  opportunity: "Opportunite",
  to_schedule: "A planifier"
};

export const ACTION_PLAN_REASON_LABELS: Record<ActionPlanReasonCode, string> = {
  TASK_OVERDUE_GT_24H: "Tache en retard de plus de 24 heures",
  TASK_OVERDUE_LT_24H: "Tache en retard",
  DUE_TODAY: "Echeance aujourd'hui",
  HIGH_PRIORITY: "Priorite elevee",
  MEDIUM_PRIORITY: "Priorite normale",
  SNOOZED: "Tache deja reportee",
  SNOOZED_MULTIPLE_TIMES: "Tache reportee plusieurs fois",
  RELATIONSHIP_INACTIVE_14D: "Relation inactive depuis au moins 14 jours",
  RELATIONSHIP_INACTIVE_30D: "Relation inactive depuis au moins 30 jours",
  IMPORTANT_WITHOUT_DUE_DATE: "Action importante sans echeance"
};

export function actionPlanItemHref(item: ActionPlanItem) {
  if (item.sourceType === "task") return `/tasks/${item.sourceId}`;
  if (item.relationshipId) return `/relationships/${item.relationshipId}`;
  if (item.organizationId) return `/organizations/${item.organizationId}`;
  return "/action-plan";
}

export function actionPlanCreateTaskHref(item: ActionPlanItem) {
  const params = new URLSearchParams();
  params.set("sourceType", item.relationshipId ? "relationship" : "organization");
  params.set("sourceId", item.relationshipId ?? item.organizationId ?? item.sourceId);
  if (item.organizationId) params.set("organizationId", item.organizationId);
  if (item.personId) params.set("personId", item.personId);
  if (item.relationshipId) params.set("relationshipId", item.relationshipId);
  return `/tasks/new?${params.toString()}`;
}

export function actionPlanAddInteractionHref(item: ActionPlanItem) {
  const params = new URLSearchParams();
  if (item.organizationId) params.set("organizationId", item.organizationId);
  if (item.personId) params.set("personId", item.personId);
  if (item.relationshipId) params.set("relationshipId", item.relationshipId);
  return `/interactions/new?${params.toString()}`;
}
