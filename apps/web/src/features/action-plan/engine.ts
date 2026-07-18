import { ACTION_PLAN_CATEGORY_ORDER, ACTION_PLAN_SCORE_WEIGHTS, ACTION_PLAN_THRESHOLDS, FOLLOW_UP_KEYWORDS } from "./config";
import type { ActionPlanDecision, ActionPlanItem, ActionPlanReason, ActionPlanReasonCode, Interaction, Relationship, Task } from "@/types/domain";

export type ActionPlanInput = {
  organizationId: string;
  userId: string;
  now: Date;
  tasks: Task[];
  relationships: Relationship[];
  interactions: Interaction[];
  decisions: ActionPlanDecision[];
};

type RelationshipContext = {
  relationship: Relationship;
  lastInteractionAt: string;
};

function hoursBetween(from: Date, to: Date) {
  return Math.max((to.getTime() - from.getTime()) / 3_600_000, 0);
}

function daysBetween(from: Date, to: Date) {
  return Math.floor(hoursBetween(from, to) / 24);
}

function sameUtcDay(left: Date, right: Date) {
  return left.getUTCFullYear() === right.getUTCFullYear()
    && left.getUTCMonth() === right.getUTCMonth()
    && left.getUTCDate() === right.getUTCDate();
}

function reason(code: ActionPlanReasonCode, metadata?: ActionPlanReason["metadata"]): ActionPlanReason {
  return { code, weight: ACTION_PLAN_SCORE_WEIGHTS[code], ...(metadata ? { metadata } : {}) };
}

function isTaskOpen(task: Task) {
  return task.deleted_at === null && task.status !== "completed" && task.status !== "cancelled";
}

function isVisibleAfterSnooze(task: Task, now: Date) {
  return !task.snoozed_until || new Date(task.snoozed_until).getTime() <= now.getTime();
}

function taskBelongsToOrganization(task: Task, organizationId: string, relationshipsById: Map<string, Relationship>) {
  if (task.organization_id === organizationId) return true;
  if (!task.relationship_id) return false;
  return relationshipsById.get(task.relationship_id)?.organization_id === organizationId;
}

function taskReasons(task: Task, now: Date): ActionPlanReason[] {
  const reasons: ActionPlanReason[] = [];

  if (task.due_at) {
    const dueAt = new Date(task.due_at);
    if (dueAt.getTime() < now.getTime()) {
      const overdueHours = hoursBetween(dueAt, now);
      reasons.push(
        reason(overdueHours > ACTION_PLAN_THRESHOLDS.overdueCriticalHours ? "TASK_OVERDUE_GT_24H" : "TASK_OVERDUE_LT_24H", {
          overdueHours: Math.round(overdueHours)
        })
      );
    } else if (sameUtcDay(dueAt, now)) {
      reasons.push(reason("DUE_TODAY"));
    }
  }

  if (task.priority === "high" || task.priority === "critical") reasons.push(reason("HIGH_PRIORITY"));
  if (task.priority === "normal") reasons.push(reason("MEDIUM_PRIORITY"));
  if (task.snooze_count > 0) reasons.push(reason("SNOOZED", { snoozeCount: task.snooze_count }));
  if (task.snooze_count >= ACTION_PLAN_THRESHOLDS.multipleSnoozes) reasons.push(reason("SNOOZED_MULTIPLE_TIMES", { snoozeCount: task.snooze_count }));
  if (!task.due_at && (task.priority === "high" || task.priority === "critical")) reasons.push(reason("IMPORTANT_WITHOUT_DUE_DATE"));

  return reasons;
}

function score(reasons: ActionPlanReason[]) {
  return reasons.reduce((total, item) => total + item.weight, 0);
}

function taskCategory(task: Task, reasons: ActionPlanReason[], itemScore: number): ActionPlanItem["category"] {
  const codes = new Set(reasons.map((item) => item.code));
  if (codes.has("TASK_OVERDUE_GT_24H") || task.snooze_count >= ACTION_PLAN_THRESHOLDS.multipleSnoozes || itemScore >= ACTION_PLAN_THRESHOLDS.criticalScore) return "critical";
  if (codes.has("DUE_TODAY") || codes.has("HIGH_PRIORITY") || (itemScore >= ACTION_PLAN_THRESHOLDS.priorityMinScore && itemScore <= ACTION_PLAN_THRESHOLDS.priorityMaxScore)) return "priority";
  if (codes.has("IMPORTANT_WITHOUT_DUE_DATE")) return "to_schedule";
  return "to_schedule";
}

function taskItem(task: Task, organizationId: string, now: Date): ActionPlanItem {
  const reasons = taskReasons(task, now);
  const itemScore = score(reasons);
  const availableActions: ActionPlanItem["availableActions"] = ["complete", "snooze", "open"];
  if (!task.due_at) availableActions.push("schedule");

  return {
    id: `task:${task.id}`,
    sourceType: "task",
    sourceId: task.id,
    title: task.title,
    description: task.description ?? task.reason,
    category: taskCategory(task, reasons, itemScore),
    score: itemScore,
    reasons,
    dueAt: task.due_at,
    completedAt: task.completed_at,
    snoozedUntil: task.snoozed_until,
    snoozeCount: task.snooze_count,
    personId: task.person_id,
    organizationId: task.organization_id ?? organizationId,
    relationshipId: task.relationship_id,
    primaryAction: "complete",
    availableActions,
    createdAt: task.created_at
  };
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export function isEquivalentRelationshipFollowUpTask(task: Task, relationshipId: string) {
  if (!isTaskOpen(task) || task.relationship_id !== relationshipId) return false;
  const text = [task.title, task.description, task.reason, task.source_type].map(normalizeText).join(" ");
  return FOLLOW_UP_KEYWORDS.some((keyword) => text.includes(keyword));
}

function lastInteractionMap(interactions: Interaction[]) {
  const result = new Map<string, string>();
  for (const interaction of interactions) {
    if (!interaction.relationship_id || interaction.deleted_at) continue;
    const current = result.get(interaction.relationship_id);
    if (!current || new Date(interaction.interaction_date).getTime() > new Date(current).getTime()) {
      result.set(interaction.relationship_id, interaction.interaction_date);
    }
  }
  return result;
}

function visibleDecision(decision: ActionPlanDecision | undefined, now: Date) {
  if (!decision) return false;
  if (decision.decision_type === "snoozed") return Boolean(decision.snoozed_until && new Date(decision.snoozed_until).getTime() > now.getTime());
  return decision.decision_type === "ignored" || decision.decision_type === "converted_to_task" || decision.decision_type === "completed";
}

function relationshipContexts(input: ActionPlanInput): RelationshipContext[] {
  const lastByRelationship = lastInteractionMap(input.interactions);
  return input.relationships
    .filter((relationship) => relationship.organization_id === input.organizationId && relationship.status === "active")
    .map((relationship) => ({
      relationship,
      lastInteractionAt: relationship.last_interaction_at ?? lastByRelationship.get(relationship.id) ?? relationship.created_at
    }));
}

function relationshipRecommendation(input: ActionPlanInput, context: RelationshipContext, decisionsByKey: Map<string, ActionPlanDecision>, openTasks: Task[]): ActionPlanItem | null {
  const inactiveDays = daysBetween(new Date(context.lastInteractionAt), input.now);
  if (inactiveDays < ACTION_PLAN_THRESHOLDS.inactiveRelationshipDays) return null;

  const key = `relationship_inactive:${context.relationship.id}`;
  if (visibleDecision(decisionsByKey.get(key), input.now)) return null;
  if (openTasks.some((task) => isEquivalentRelationshipFollowUpTask(task, context.relationship.id))) return null;

  const reasons = [
    reason(inactiveDays >= ACTION_PLAN_THRESHOLDS.veryInactiveRelationshipDays ? "RELATIONSHIP_INACTIVE_30D" : "RELATIONSHIP_INACTIVE_14D", { inactiveDays })
  ];
  const itemScore = score(reasons);

  return {
    id: key,
    sourceType: "relationship_recommendation",
    sourceId: context.relationship.id,
    title: "Reprendre contact",
    description: `Relation inactive depuis ${inactiveDays} jour${inactiveDays > 1 ? "s" : ""}.`,
    category: "opportunity",
    score: itemScore,
    reasons,
    dueAt: context.relationship.next_action_at,
    completedAt: null,
    snoozedUntil: decisionsByKey.get(key)?.snoozed_until ?? null,
    snoozeCount: 0,
    personId: context.relationship.person_id,
    organizationId: context.relationship.organization_id,
    relationshipId: context.relationship.id,
    primaryAction: "add_interaction",
    availableActions: ["add_interaction", "create_task", "open"],
    createdAt: context.relationship.created_at
  };
}

function compareDate(left: string | null, right: string | null) {
  if (left && right) return new Date(left).getTime() - new Date(right).getTime();
  if (left) return -1;
  if (right) return 1;
  return 0;
}

export function sortActionPlanItems(items: ActionPlanItem[]) {
  return [...items].sort((left, right) => {
    const category = ACTION_PLAN_CATEGORY_ORDER[left.category] - ACTION_PLAN_CATEGORY_ORDER[right.category];
    if (category !== 0) return category;
    const itemScore = right.score - left.score;
    if (itemScore !== 0) return itemScore;
    const due = compareDate(left.dueAt, right.dueAt);
    if (due !== 0) return due;
    const created = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    if (created !== 0) return created;
    return left.id.localeCompare(right.id);
  });
}

export function buildActionPlan(input: ActionPlanInput): ActionPlanItem[] {
  const relationshipsById = new Map(input.relationships.map((relationship) => [relationship.id, relationship]));
  const openTasks = input.tasks.filter((task) => isTaskOpen(task) && taskBelongsToOrganization(task, input.organizationId, relationshipsById));
  const taskItems = openTasks
    .filter((task) => isVisibleAfterSnooze(task, input.now))
    .map((task) => taskItem(task, input.organizationId, input.now));
  const decisionsByKey = new Map(input.decisions.filter((decision) => decision.user_id === input.userId && decision.organization_id === input.organizationId).map((decision) => [decision.recommendation_key, decision]));
  const recommendationItems = relationshipContexts(input)
    .map((context) => relationshipRecommendation(input, context, decisionsByKey, openTasks))
    .filter((item): item is ActionPlanItem => Boolean(item));

  return sortActionPlanItems([...taskItems, ...recommendationItems]);
}
