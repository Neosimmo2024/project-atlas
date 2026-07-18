import type { ActionPlanCategory, ActionPlanItem, ActionPlanReason, ActionPlanReasonCode } from "@/types/domain";

export const ACTION_PLAN_CATEGORY_LABELS: Record<ActionPlanCategory, string> = {
  critical: "Critique",
  priority: "Prioritaire",
  opportunity: "Relations à réactiver",
  to_schedule: "À planifier"
};

export const ACTION_PLAN_REASON_LABELS: Record<ActionPlanReasonCode, string> = {
  TASK_OVERDUE_GT_24H: "Cette tâche est en retard depuis plus de 24 heures.",
  TASK_OVERDUE_LT_24H: "Cette tâche est en retard.",
  DUE_TODAY: "Cette tâche est prévue aujourd’hui.",
  HIGH_PRIORITY: "Cette action est marquée en priorité élevée.",
  MEDIUM_PRIORITY: "Cette action a une priorité normale.",
  SNOOZED: "Cette action a déjà été reportée.",
  SNOOZED_MULTIPLE_TIMES: "Cette action a déjà été reportée plusieurs fois.",
  RELATIONSHIP_INACTIVE_14D: "Cette relation n’a eu aucun échange récent.",
  RELATIONSHIP_INACTIVE_30D: "Cette relation n’a eu aucun échange depuis longtemps.",
  IMPORTANT_WITHOUT_DUE_DATE: "Cette action importante n’a pas encore d’échéance."
};

export type ActionPlanUiItem = ActionPlanItem & {
  entityName: string;
};

export type ActionPlanCardAction = {
  key: "complete" | "plan" | "add_interaction" | "open" | "create_task" | "snooze";
  label: string;
};

export type PublicActionPlanCard = {
  id: string;
  categoryLabel: string;
  title: string;
  entityName: string;
  primaryReason: string;
  reasons: string[];
  primaryAction: ActionPlanCardAction;
  secondaryActions: ActionPlanCardAction[];
  href: string;
};

export function actionPlanItemHref(item: ActionPlanItem) {
  if (item.relationshipId) return `/relationships/${item.relationshipId}`;
  if (item.personId) return `/people/${item.personId}`;
  if (item.organizationId) return `/organizations/${item.organizationId}`;
  if (item.sourceType === "task") return `/tasks/${item.sourceId}`;
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

export function groupActionPlanItems<T extends ActionPlanItem>(items: T[]) {
  return [
    { category: "critical" as const, items: items.filter((item) => item.category === "critical") },
    { category: "priority" as const, items: items.filter((item) => item.category === "priority") },
    { category: "opportunity" as const, items: items.filter((item) => item.category === "opportunity") },
    { category: "to_schedule" as const, items: items.filter((item) => item.category === "to_schedule") }
  ].filter((group) => group.items.length > 0);
}

export function primaryReasonText(reason: ActionPlanReason | undefined) {
  if (!reason) return "Atlas a identifié cette action comme prioritaire.";
  if ((reason.code === "RELATIONSHIP_INACTIVE_14D" || reason.code === "RELATIONSHIP_INACTIVE_30D") && typeof reason.metadata?.inactiveDays === "number") {
    return `Cette relation n’a eu aucun échange depuis ${reason.metadata.inactiveDays} jours.`;
  }
  if (reason.code === "SNOOZED_MULTIPLE_TIMES" && typeof reason.metadata?.snoozeCount === "number") {
    return `Cette action a déjà été reportée ${reason.metadata.snoozeCount} fois.`;
  }
  return ACTION_PLAN_REASON_LABELS[reason.code];
}

export function actionPlanSummary(count: number) {
  if (count === 0) return "Aucune action prioritaire ne vous attend aujourd’hui.";
  if (count === 1) return "1 action prioritaire vous attend aujourd’hui.";
  return `${count} actions prioritaires vous attendent aujourd’hui.`;
}

export function completedTodayLabel(count: number) {
  return `Réalisé aujourd’hui - ${count}`;
}

export function primaryActionForItem(item: ActionPlanItem): ActionPlanCardAction {
  if (item.sourceType === "task" && item.dueAt) return { key: "complete", label: "Terminer" };
  if (item.sourceType === "task") return { key: "plan", label: "Planifier" };
  return { key: "add_interaction", label: "Ajouter un échange" };
}

export function secondaryActionsForItem(item: ActionPlanItem): ActionPlanCardAction[] {
  const actions: ActionPlanCardAction[] = [{ key: "open", label: "Ouvrir" }];
  if (item.sourceType === "relationship_recommendation") {
    actions.push({ key: "create_task", label: "Créer une tâche" });
  }
  actions.push({ key: "snooze", label: "Reporter" });
  return actions.slice(0, 2);
}

export function publicActionPlanCard(item: ActionPlanUiItem): PublicActionPlanCard {
  return {
    id: item.id,
    categoryLabel: ACTION_PLAN_CATEGORY_LABELS[item.category],
    title: item.title,
    entityName: item.entityName,
    primaryReason: primaryReasonText(item.reasons[0]),
    reasons: item.reasons.map((reason) => primaryReasonText(reason)),
    primaryAction: primaryActionForItem(item),
    secondaryActions: secondaryActionsForItem(item),
    href: actionPlanItemHref(item)
  };
}

export function optimisticRemoveActionPlanItem<T extends ActionPlanItem>(items: T[], itemId: string) {
  return items.filter((item) => item.id !== itemId);
}

export function restoreActionPlanItem<T extends ActionPlanItem>(items: T[], item: T) {
  if (items.some((current) => current.id === item.id)) return items;
  return [item, ...items];
}

export function buildSnoozePayload(item: ActionPlanItem, snoozedUntil: string) {
  return {
    action: "snooze",
    itemId: item.id,
    sourceType: item.sourceType,
    sourceId: item.sourceId,
    organizationId: item.organizationId,
    snoozedUntil
  };
}

export function buildPlanTaskPayload(item: ActionPlanItem, dueAt: string) {
  return {
    action: "plan_task",
    taskId: item.sourceId,
    dueAt
  };
}
