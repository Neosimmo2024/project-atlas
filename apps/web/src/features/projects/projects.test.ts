import { describe, expect, it } from "vitest";
import { calculateProjectNextAction } from "@/repositories/projects";
import { parseProjectInput, parseProjectLoseInput, parseProjectPatchInput } from "./validation";
import type { Task } from "@/types/domain";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    tenant_id: "tenant-a",
    title: "Relancer",
    description: null,
    status: "todo",
    priority: "normal",
    due_at: null,
    completed_at: null,
    assigned_to: null,
    created_by: "user-a",
    person_id: null,
    organization_id: null,
    relationship_id: null,
    interaction_id: null,
    project_id: "project-1",
    source_type: null,
    source_id: null,
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

describe("projects foundation", () => {
  it("validates required project fields and decimal financial values", () => {
    const parsed = parseProjectInput({
      title: "Recrutement Renato",
      project_type: "recruitment",
      status: "open",
      stage: "qualification",
      currency: "eur",
      estimated_value: "12000.50"
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.currency).toBe("EUR");
      expect(parsed.data.estimated_value).toBe("12000.50");
    }
  });

  it("requires a note when the loss reason is other", () => {
    const parsed = parseProjectLoseInput({ lossReason: "other" });

    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0]?.path).toEqual(["note"]);
  });

  it("accepts partial patches and explicit null deletion for optional fields", () => {
    const stageOnly = parseProjectPatchInput({ stage: "proposal" });
    const ownerOnly = parseProjectPatchInput({ owner_user_id: "11111111-1111-4111-8111-111111111111" });
    const clearOptional = parseProjectPatchInput({ short_description: null, expected_close_at: null });

    expect(stageOnly.success).toBe(true);
    expect(ownerOnly.success).toBe(true);
    expect(clearOptional.success).toBe(true);
    if (clearOptional.success) {
      expect(clearOptional.data.short_description).toBeNull();
      expect(clearOptional.data.expected_close_at).toBeNull();
    }
  });

  it("rejects empty patches and transition-only fields", () => {
    const empty = parseProjectPatchInput({});
    const forbidden = parseProjectPatchInput({
      status: "won",
      final_value: "12000.00",
      won_at: "2026-07-18T08:00:00Z",
      lost_at: null,
      loss_reason: null,
      archived_at: null
    });

    expect(empty.success).toBe(false);
    expect(forbidden.success).toBe(false);
    if (!forbidden.success) {
      expect(forbidden.error.issues.map((issue) => issue.path.join("."))).toEqual(expect.arrayContaining(["status", "final_value", "won_at", "lost_at", "loss_reason", "archived_at"]));
    }
  });

  it("calculates next action using overdue, today, next due, then priority without due date", () => {
    const now = new Date("2026-07-18T12:00:00Z");

    expect(calculateProjectNextAction([
      task({ id: "future", due_at: "2026-07-20T09:00:00Z" }),
      task({ id: "overdue", due_at: "2026-07-16T09:00:00Z" })
    ], now)?.taskId).toBe("overdue");

    expect(calculateProjectNextAction([
      task({ id: "future", due_at: "2026-07-20T09:00:00Z" }),
      task({ id: "today", due_at: "2026-07-18T18:00:00Z" })
    ], now)?.reason).toBe("today");

    expect(calculateProjectNextAction([
      task({ id: "priority", due_at: null, priority: "critical" }),
      task({ id: "future", due_at: "2026-07-20T09:00:00Z" })
    ], now)?.taskId).toBe("future");

    expect(calculateProjectNextAction([
      task({ id: "priority", due_at: null, priority: "critical" })
    ], now)?.reason).toBe("priority_without_due");
  });
});
