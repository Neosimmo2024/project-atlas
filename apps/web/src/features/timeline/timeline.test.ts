import { describe, expect, it } from "vitest";
import { buildInteractionBackfillEvent, buildPersonBackfillEvent, buildRelationshipBackfillEvents, buildTaskBackfillEvent } from "./backfill";
import { TIMELINE_EVENT_LABELS } from "./options";
import { shouldShowTimelinePagination } from "./pagination";
import { normalizeTimelineListParams, timelineEventTypesForCategory } from "./search";
import type { Interaction, Person, Relationship, Task } from "@/types/domain";

const now = "2026-01-01T10:00:00Z";

describe("timeline helpers", () => {
  it("maps French event labels", () => {
    expect(TIMELINE_EVENT_LABELS.interaction_created).toBe("Échange créé");
    expect(TIMELINE_EVENT_LABELS.organization_linked).toBe("Organisation liée");
    expect(TIMELINE_EVENT_LABELS.relationship_created).toBe("Relation créée");
    expect(TIMELINE_EVENT_LABELS.task_completed).toBe("Tâche terminée");
  });

  it("normalizes pagination and category filters", () => {
    const params = normalizeTimelineListParams({ category: "tasks", page: 2, pageSize: 5 });

    expect(params.eventTypes).toContain("task_created");
    expect(params.from).toBe(5);
    expect(params.to).toBe(9);
  });

  it("falls back to all events for unknown categories", () => {
    expect(timelineEventTypesForCategory("unknown")).toEqual([]);
  });

  it("hides pagination when there is only one chronology page", () => {
    expect(shouldShowTimelinePagination(1)).toBe(false);
    expect(shouldShowTimelinePagination(2)).toBe(true);
  });

  it("builds backfill events with stable idempotency keys", () => {
    const person: Person = {
      id: "person-1",
      tenant_id: "tenant-a",
      first_name: "Renato",
      last_name: "Ponzio",
      display_name: "Renato Ponzio",
      primary_email: null,
      primary_phone: null,
      city: null,
      postal_code: null,
      department: null,
      linkedin_url: null,
      job_title: null,
      comments: null,
      source: "manual",
      status: "qualified",
      talent_types: [],
      priority: "medium",
      talent_score: null,
      contact_allowed: true,
      do_not_contact: false,
      created_at: now,
      updated_at: now
    };

    expect(buildPersonBackfillEvent(person)).toMatchObject({
      event_type: "person_created",
      person_id: "person-1",
      idempotency_key: "person_created:person-1"
    });
  });

  it("builds context events for relationships, interactions, and tasks", () => {
    const relationship: Relationship = {
      id: "relationship-1",
      tenant_id: "tenant-a",
      person_id: "person-1",
      organization_id: "organization-1",
      relationship_type: "recruiting",
      pipeline_stage: "qualification",
      status: "active",
      owner_user_id: null,
      score: null,
      confidence: null,
      next_action_at: null,
      started_at: null,
      ended_at: null,
      last_interaction_at: null,
      notes: null,
      tags: [],
      metadata: {},
      created_at: now,
      updated_at: now
    };
    const interaction: Interaction = {
      id: "interaction-1",
      tenant_id: "tenant-a",
      person_id: "person-1",
      organization_id: "organization-1",
      relationship_id: "relationship-1",
      type_id: "type-1",
      title: "Appel",
      summary: null,
      interaction_date: now,
      duration_minutes: null,
      location: null,
      created_by: "user-1",
      change_reason: null,
      main_obstacle: null,
      timing: null,
      dna_compatibility: null,
      work_with_person_desire: null,
      comments: null,
      metadata: {},
      created_at: now,
      updated_at: now,
      deleted_at: null
    };
    const task: Task = {
      id: "task-1",
      tenant_id: "tenant-a",
      title: "Relancer",
      description: null,
      status: "todo",
      priority: "normal",
      due_at: null,
      completed_at: null,
      assigned_to: null,
      created_by: "user-1",
      person_id: "person-1",
      organization_id: "organization-1",
      relationship_id: "relationship-1",
      interaction_id: "interaction-1",
      source_type: "interaction",
      source_id: "interaction-1",
      reason: null,
      metadata: {},
      created_at: now,
      updated_at: now,
      deleted_at: null
    };

    expect(buildRelationshipBackfillEvents(relationship).map((event) => event.event_type)).toEqual(["relationship_created", "organization_linked"]);
    expect(buildInteractionBackfillEvent(interaction).interaction_id).toBe("interaction-1");
    expect(buildTaskBackfillEvent(task).task_id).toBe("task-1");
  });
});
