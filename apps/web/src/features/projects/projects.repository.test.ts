import { describe, expect, it } from "vitest";
import { calculateProjectNextAction } from "@/repositories/projects";
import type { Task } from "@/types/domain";

function task(id: string, overrides: Partial<Task>): Task {
  return {
    id,
    tenant_id: "tenant-a",
    title: id,
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
    project_id: "project-a",
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

describe("projects repository calculations", () => {
  it("ignores completed, cancelled, deleted, and unscoped tasks when computing the next action", () => {
    const next = calculateProjectNextAction([
      task("completed", { status: "completed", completed_at: "2026-07-18T08:00:00Z" }),
      task("cancelled", { status: "cancelled" }),
      task("deleted", { deleted_at: "2026-07-18T08:00:00Z" }),
      task("unscoped", { project_id: null, due_at: "2026-07-16T08:00:00Z" }),
      task("visible", { due_at: "2026-07-18T18:00:00Z" })
    ], new Date("2026-07-18T12:00:00Z"));

    expect(next).toMatchObject({ taskId: "visible", reason: "today" });
  });

  it("uses a stable task id tiebreaker for equal due dates", () => {
    const next = calculateProjectNextAction([
      task("task-b", { due_at: "2026-07-16T08:00:00Z" }),
      task("task-a", { due_at: "2026-07-16T08:00:00Z" })
    ], new Date("2026-07-18T12:00:00Z"));

    expect(next?.taskId).toBe("task-a");
  });
});
