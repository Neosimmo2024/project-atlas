import { describe, expect, it } from "vitest";
import {
  ACTION_PLAN_CATEGORY_LABELS,
  actionPlanItemHref,
  actionPlanItemLinkLabel,
  actionPlanReasonLabel,
  formatActionPlanDate
} from "./action-plan-ui";
import type { ActionPlanItem, ActionPlanReason } from "@/types/domain";

function item(overrides: Partial<ActionPlanItem> = {}): ActionPlanItem {
  return {
    id: "task:task-1",
    sourceType: "task",
    sourceId: "task-1",
    title: "Relancer",
    description: null,
    category: "priority",
    score: 35,
    reasons: [{ code: "DUE_TODAY", weight: 35 }],
    dueAt: "2026-07-18T18:00:00Z",
    completedAt: null,
    snoozedUntil: null,
    snoozeCount: 0,
    personId: null,
    organizationId: "organization-1",
    relationshipId: null,
    primaryAction: "complete",
    availableActions: ["complete", "snooze", "open"],
    createdAt: "2026-07-01T08:00:00Z",
    ...overrides
  };
}

describe("action plan UI helpers", () => {
  it("exposes French category labels", () => {
    expect(ACTION_PLAN_CATEGORY_LABELS).toMatchObject({
      critical: "Critique",
      priority: "Prioritaire",
      opportunity: "Opportunité",
      to_schedule: "À planifier"
    });
  });

  it("translates deterministic reasons without exposing technical codes", () => {
    const reasons: ActionPlanReason[] = [
      { code: "TASK_OVERDUE_GT_24H", weight: 50, metadata: { overdueHours: 27 } },
      { code: "DUE_TODAY", weight: 35 },
      { code: "RELATIONSHIP_INACTIVE_30D", weight: 35, metadata: { inactiveDays: 42 } }
    ];

    expect(reasons.map(actionPlanReasonLabel)).toEqual([
      "Échéance dépassée depuis 27 h.",
      "Échéance prévue aujourd’hui.",
      "Relation inactive depuis 42 jours."
    ]);
  });

  it("links consultation cards to the existing source detail pages", () => {
    expect(actionPlanItemHref(item())).toBe("/tasks/task-1");
    expect(actionPlanItemHref(item(), "/action-plan?organizationId=organization-1")).toBe("/tasks/task-1?returnTo=%2Faction-plan%3ForganizationId%3Dorganization-1");
    expect(actionPlanItemLinkLabel(item())).toBe("Ouvrir la tâche");
    expect(actionPlanItemHref(item({ sourceType: "relationship_recommendation", sourceId: "relationship-1" }))).toBe("/relationships/relationship-1");
    expect(actionPlanItemLinkLabel(item({ sourceType: "relationship_recommendation" }))).toBe("Ouvrir la relation");
  });

  it("formats dates in the Europe/Paris user timezone", () => {
    expect(formatActionPlanDate("2026-07-18T18:00:00Z")).toContain("20:00");
    expect(formatActionPlanDate(null)).toBeNull();
  });
});
