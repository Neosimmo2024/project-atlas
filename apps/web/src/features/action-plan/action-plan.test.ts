import { describe, expect, it } from "vitest";
import { buildActionPlan, isEquivalentRelationshipFollowUpTask } from "./engine";
import type { ActionPlanDecision, Interaction, Relationship, Task } from "@/types/domain";

const now = new Date("2026-07-18T12:00:00Z");
const organizationId = "22222222-2222-4222-8222-222222222222";
const otherOrganizationId = "33333333-3333-4333-8333-333333333333";
const userId = "44444444-4444-4444-8444-444444444444";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    tenant_id: "tenant-a",
    title: "Relancer un talent",
    description: null,
    status: "todo",
    priority: "normal",
    due_at: null,
    completed_at: null,
    assigned_to: userId,
    created_by: userId,
    person_id: "person-1",
    organization_id: organizationId,
    relationship_id: null,
    interaction_id: null,
    source_type: "organization",
    source_id: organizationId,
    reason: null,
    metadata: {},
    snoozed_until: null,
    snooze_count: 0,
    last_snoozed_at: null,
    created_at: "2026-07-01T08:00:00Z",
    updated_at: "2026-07-01T08:00:00Z",
    deleted_at: null,
    ...overrides
  };
}

function relationship(overrides: Partial<Relationship> = {}): Relationship {
  return {
    id: "relationship-1",
    tenant_id: "tenant-a",
    person_id: "person-1",
    organization_id: organizationId,
    relationship_type: "recruiting",
    pipeline_stage: "qualification",
    status: "active",
    owner_user_id: userId,
    score: null,
    confidence: null,
    next_action_at: null,
    started_at: null,
    ended_at: null,
    last_interaction_at: null,
    notes: null,
    tags: [],
    metadata: {},
    created_at: "2026-06-01T08:00:00Z",
    updated_at: "2026-06-01T08:00:00Z",
    ...overrides
  };
}

function interaction(overrides: Partial<Interaction> = {}): Interaction {
  return {
    id: "interaction-1",
    tenant_id: "tenant-a",
    person_id: "person-1",
    organization_id: organizationId,
    relationship_id: "relationship-1",
    type_id: "type-1",
    title: "Appel",
    summary: null,
    interaction_date: "2026-07-01T08:00:00Z",
    duration_minutes: null,
    location: null,
    created_by: userId,
    change_reason: null,
    main_obstacle: null,
    timing: null,
    dna_compatibility: null,
    work_with_person_desire: null,
    comments: null,
    metadata: {},
    created_at: "2026-07-01T08:00:00Z",
    updated_at: "2026-07-01T08:00:00Z",
    deleted_at: null,
    ...overrides
  };
}

function decision(overrides: Partial<ActionPlanDecision> = {}): ActionPlanDecision {
  return {
    id: "decision-1",
    tenant_id: "tenant-a",
    organization_id: organizationId,
    user_id: userId,
    recommendation_key: "relationship_inactive:relationship-1",
    decision_type: "ignored",
    snoozed_until: null,
    created_at: "2026-07-01T08:00:00Z",
    updated_at: "2026-07-01T08:00:00Z",
    ...overrides
  };
}

function plan(input: Partial<Parameters<typeof buildActionPlan>[0]> = {}) {
  return buildActionPlan({
    organizationId,
    userId,
    now,
    tasks: [],
    relationships: [],
    interactions: [],
    decisions: [],
    ...input
  });
}

describe("action plan engine", () => {
  it("scores a task overdue by more than 24 hours as critical", () => {
    const [item] = plan({ tasks: [task({ due_at: "2026-07-16T11:00:00Z" })] });

    expect(item.score).toBe(60);
    expect(item.category).toBe("critical");
    expect(item.reasons.map((reason) => reason.code)).toEqual(["TASK_OVERDUE_GT_24H", "MEDIUM_PRIORITY"]);
  });

  it("scores a task overdue by less than 24 hours", () => {
    const [item] = plan({ tasks: [task({ due_at: "2026-07-18T06:00:00Z", priority: "low" })] });

    expect(item.score).toBe(40);
    expect(item.category).toBe("priority");
    expect(item.reasons[0]).toMatchObject({ code: "TASK_OVERDUE_LT_24H", weight: 40 });
  });

  it("scores a task due today", () => {
    const [item] = plan({ tasks: [task({ due_at: "2026-07-18T18:00:00Z", priority: "low" })] });

    expect(item.score).toBe(35);
    expect(item.category).toBe("priority");
    expect(item.reasons.map((reason) => reason.code)).toContain("DUE_TODAY");
  });

  it("scores high priority without a due date as to schedule by explicit important rule", () => {
    const [item] = plan({ tasks: [task({ priority: "high", due_at: null })] });

    expect(item.score).toBe(40);
    expect(item.category).toBe("priority");
    expect(item.reasons.map((reason) => reason.code)).toEqual(["HIGH_PRIORITY", "IMPORTANT_WITHOUT_DUE_DATE"]);
    expect(item.availableActions).toContain("schedule");
  });

  it("scores medium priority", () => {
    const [item] = plan({ tasks: [task({ priority: "normal" })] });

    expect(item.score).toBe(10);
    expect(item.reasons).toEqual([{ code: "MEDIUM_PRIORITY", weight: 10 }]);
  });

  it("scores an important task without a due date", () => {
    const [item] = plan({ tasks: [task({ priority: "critical", due_at: null })] });

    expect(item.reasons.map((reason) => reason.code)).toContain("IMPORTANT_WITHOUT_DUE_DATE");
    expect(item.score).toBe(40);
  });

  it("scores one snooze and three snoozes", () => {
    const [three, one] = plan({
      tasks: [
        task({ id: "one", snooze_count: 1 }),
        task({ id: "three", snooze_count: 3, created_at: "2026-06-01T08:00:00Z" })
      ]
    });

    expect(one.score).toBe(20);
    expect(three.score).toBe(40);
    expect(three.category).toBe("critical");
    expect(three.reasons.map((reasonItem) => reasonItem.code)).toContain("SNOOZED_MULTIPLE_TIMES");
  });

  it("hides a task until snoozed_until expires", () => {
    expect(plan({ tasks: [task({ snoozed_until: "2026-07-19T12:00:00Z" })] })).toEqual([]);
    expect(plan({ tasks: [task({ snoozed_until: "2026-07-18T11:59:00Z" })] })).toHaveLength(1);
  });

  it("creates relationship recommendations after 14 and 30 inactive days without cumulative inactive scores", () => {
    const items = plan({
      relationships: [
        relationship({ id: "relationship-14", last_interaction_at: "2026-07-01T12:00:00Z" }),
        relationship({ id: "relationship-30", last_interaction_at: "2026-06-01T12:00:00Z", created_at: "2026-05-01T12:00:00Z" })
      ],
      interactions: []
    });

    expect(items).toHaveLength(2);
    expect(items.find((item) => item.sourceId === "relationship-14")?.reasons).toEqual([{ code: "RELATIONSHIP_INACTIVE_14D", weight: 20, metadata: { inactiveDays: 17 } }]);
    expect(items.find((item) => item.sourceId === "relationship-30")?.reasons).toEqual([{ code: "RELATIONSHIP_INACTIVE_30D", weight: 35, metadata: { inactiveDays: 47 } }]);
  });

  it("excludes active relationships with a recent exchange", () => {
    const items = plan({
      relationships: [relationship({ last_interaction_at: null })],
      interactions: [interaction({ interaction_date: "2026-07-10T12:00:00Z" })]
    });

    expect(items).toEqual([]);
  });

  it("uses the most recent date between relationship and interaction activity", () => {
    const items = plan({
      relationships: [relationship({ last_interaction_at: "2026-06-01T12:00:00Z" })],
      interactions: [interaction({ interaction_date: "2026-07-10T12:00:00Z" })]
    });

    expect(items).toEqual([]);
  });

  it("excludes inactive relationship recommendations when an equivalent open task exists", () => {
    const rel = relationship({ last_interaction_at: "2026-06-01T12:00:00Z" });
    const followUpTask = task({ id: "follow-up", relationship_id: rel.id, organization_id: null, title: "Relance relation" });

    expect(isEquivalentRelationshipFollowUpTask(followUpTask, rel.id)).toBe(true);
    expect(plan({ tasks: [followUpTask], relationships: [rel] }).filter((item) => item.sourceType === "relationship_recommendation")).toEqual([]);
  });

  it("applies recommendation decisions", () => {
    const rel = relationship({ last_interaction_at: "2026-06-01T12:00:00Z" });

    expect(plan({ relationships: [rel], decisions: [decision({ decision_type: "ignored" })] })).toEqual([]);
    expect(plan({ relationships: [rel], decisions: [decision({ decision_type: "completed" })] })).toEqual([]);
    expect(plan({ relationships: [rel], decisions: [decision({ decision_type: "converted_to_task" })] })).toEqual([]);
    expect(plan({ relationships: [rel], decisions: [decision({ decision_type: "snoozed", snoozed_until: "2026-07-19T12:00:00Z" })] })).toEqual([]);
    expect(plan({ relationships: [rel], decisions: [decision({ decision_type: "snoozed", snoozed_until: "2026-07-17T12:00:00Z" })] })).toHaveLength(1);
  });

  it("excludes completed, cancelled, deleted, duplicate, and other organization tasks", () => {
    const items = plan({
      tasks: [
        task({ id: "completed", status: "completed", completed_at: "2026-07-18T10:00:00Z" }),
        task({ id: "cancelled", status: "cancelled" }),
        task({ id: "deleted", deleted_at: "2026-07-18T10:00:00Z" }),
        task({ id: "other-org", organization_id: otherOrganizationId }),
        task({ id: "visible" })
      ]
    });

    expect(items.map((item) => item.sourceId)).toEqual(["visible"]);
  });

  it("sorts deterministically by category, score, due date, then creation date", () => {
    const input = {
      tasks: [
        task({ id: "schedule-old", priority: "low", due_at: null, created_at: "2026-01-01T00:00:00Z" }),
        task({ id: "critical", due_at: "2026-07-15T12:00:00Z", priority: "high" }),
        task({ id: "priority-sooner", due_at: "2026-07-18T13:00:00Z", priority: "low" }),
        task({ id: "priority-later", due_at: "2026-07-18T20:00:00Z", priority: "low" })
      ]
    };
    const items = plan(input);

    expect(items.map((item) => item.sourceId)).toEqual(["critical", "priority-sooner", "priority-later", "schedule-old"]);
    expect(plan(input)).toEqual(items);
  });

  it("supports now injection and returns an empty plan", () => {
    expect(plan()).toEqual([]);
    expect(plan({ now: new Date("2026-07-18T05:00:00Z"), tasks: [task({ due_at: "2026-07-18T06:00:00Z", priority: "low" })] })[0].category).toBe("priority");
  });
});
