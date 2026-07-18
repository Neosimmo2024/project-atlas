import { describe, expect, it } from "vitest";
import {
  ACTION_PLAN_CATEGORY_LABELS,
  actionPlanAddInteractionHref,
  actionPlanCreateTaskHref,
  actionPlanItemHref,
  buildPlanTaskPayload,
  buildSnoozePayload,
  groupActionPlanItems,
  optimisticRemoveActionPlanItem,
  primaryActionForItem,
  publicActionPlanCard,
  restoreActionPlanItem
} from "./presentation";
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
      opportunity: "Relations à réactiver",
      to_schedule: "À planifier"
    });
  });

  it("links the open action by relationship, person, organization, then task priority", () => {
    expect(actionPlanItemHref(baseItem)).toBe("/organizations/organization-1");
    expect(actionPlanItemHref({ ...baseItem, organizationId: null })).toBe("/tasks/task-1");
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

  it("groups visible cards by the expected Atlas categories and hides empty groups", () => {
    const groups = groupActionPlanItems([
      { ...baseItem, id: "schedule", category: "to_schedule" },
      { ...baseItem, id: "critical", category: "critical" }
    ]);

    expect(groups.map((group) => group.category)).toEqual(["critical", "to_schedule"]);
  });

  it("projects cards without exposing score, reason weights, source type, or technical metadata", () => {
    const card = publicActionPlanCard({ ...baseItem, entityName: "Renato Ponzio - NEOS IMMO" });
    const serialized = JSON.stringify(card);

    expect(card).toMatchObject({
      categoryLabel: "Prioritaire",
      entityName: "Renato Ponzio - NEOS IMMO",
      primaryAction: { key: "complete", label: "Terminer" },
      secondaryActions: [{ key: "open", label: "Ouvrir" }, { key: "snooze", label: "Reporter" }]
    });
    expect(serialized).not.toContain("score");
    expect(serialized).not.toContain("sourceType");
    expect(serialized).not.toContain("weight");
    expect(serialized).not.toContain("DUE_TODAY");
  });

  it("selects the expected primary action for dated tasks, undated tasks, and relationship recommendations", () => {
    expect(primaryActionForItem(baseItem)).toEqual({ key: "complete", label: "Terminer" });
    expect(primaryActionForItem({ ...baseItem, dueAt: null })).toEqual({ key: "plan", label: "Planifier" });
    expect(primaryActionForItem({ ...baseItem, sourceType: "relationship_recommendation" })).toEqual({ key: "add_interaction", label: "Ajouter un échange" });
  });

  it("keeps snooze decisions separate from due date planning payloads", () => {
    expect(buildSnoozePayload(baseItem, "2026-07-19T09:00:00.000Z")).toEqual({
      action: "snooze",
      itemId: "task:task-1",
      sourceType: "task",
      sourceId: "task-1",
      organizationId: "organization-1",
      snoozedUntil: "2026-07-19T09:00:00.000Z"
    });
    expect(buildSnoozePayload(baseItem, "2026-07-19T09:00:00.000Z")).not.toHaveProperty("dueAt");
    expect(buildPlanTaskPayload(baseItem, "2026-07-18T18:00:00.000Z")).toEqual({
      action: "plan_task",
      taskId: "task-1",
      dueAt: "2026-07-18T18:00:00.000Z"
    });
  });

  it("supports optimistic completion removal and undo restoration", () => {
    const removed = optimisticRemoveActionPlanItem([baseItem], baseItem.id);

    expect(removed).toEqual([]);
    expect(restoreActionPlanItem(removed, baseItem)).toEqual([baseItem]);
    expect(restoreActionPlanItem([baseItem], baseItem)).toEqual([baseItem]);
  });
});
