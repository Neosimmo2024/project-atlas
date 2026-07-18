import { describe, expect, it } from "vitest";
import { ACTION_PLAN_CATEGORY_LABELS, actionPlanAddInteractionHref, actionPlanCreateTaskHref, actionPlanItemHref } from "./presentation";
import type { ActionPlanItem } from "@/types/domain";

const baseItem: ActionPlanItem = {
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
  availableActions: ["complete", "open"],
  createdAt: "2026-07-01T08:00:00Z"
};

describe("action plan presentation", () => {
  it("exposes stable French category labels", () => {
    expect(ACTION_PLAN_CATEGORY_LABELS).toMatchObject({
      critical: "Critique",
      priority: "Prioritaire",
      opportunity: "Opportunite",
      to_schedule: "A planifier"
    });
  });

  it("links task items to their task detail", () => {
    expect(actionPlanItemHref(baseItem)).toBe("/tasks/task-1");
  });

  it("builds context links for relationship recommendations", () => {
    const item: ActionPlanItem = {
      ...baseItem,
      id: "relationship_inactive:relationship-1",
      sourceType: "relationship_recommendation",
      sourceId: "relationship-1",
      relationshipId: "relationship-1",
      personId: "person-1",
      primaryAction: "add_interaction",
      availableActions: ["add_interaction", "create_task", "open"]
    };

    expect(actionPlanItemHref(item)).toBe("/relationships/relationship-1");
    expect(actionPlanCreateTaskHref(item)).toBe("/tasks/new?sourceType=relationship&sourceId=relationship-1&organizationId=organization-1&personId=person-1&relationshipId=relationship-1");
    expect(actionPlanAddInteractionHref(item)).toBe("/interactions/new?organizationId=organization-1&personId=person-1&relationshipId=relationship-1");
  });
});
