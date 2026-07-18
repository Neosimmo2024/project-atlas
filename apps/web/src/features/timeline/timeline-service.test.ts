import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task, TenantContext } from "@/types/domain";

const mocks = vi.hoisted(() => ({
  createTimelineEventMock: vi.fn()
}));

vi.mock("@/repositories/timeline-events", () => ({
  createTimelineEvent: mocks.createTimelineEventMock
}));

const context: TenantContext = {
  tenantId: "tenant-a",
  tenant: { id: "tenant-a", name: "Tenant A" },
  userId: "user-a",
  role: "owner"
};

function task(status: Task["status"], updatedAt = "2026-01-01T10:00:00Z"): Task {
  return {
    id: "task-1",
    tenant_id: "tenant-a",
    title: "Relancer",
    description: null,
    status,
    priority: "normal",
    due_at: null,
    completed_at: status === "completed" ? updatedAt : null,
    assigned_to: null,
    created_by: "user-a",
    person_id: "person-1",
    organization_id: null,
    relationship_id: null,
    interaction_id: null,
    source_type: "person",
    source_id: "person-1",
    reason: null,
    metadata: {},
    snoozed_until: null,
    snooze_count: 0,
    last_snoozed_at: null,
    created_at: "2026-01-01T09:00:00Z",
    updated_at: updatedAt,
    deleted_at: null
  };
}

describe("timeline service", () => {
  beforeEach(() => {
    mocks.createTimelineEventMock.mockReset();
  });

  it("records task completion and reopening events", async () => {
    const { recordTaskChanged } = await import("@/services/timeline-service");

    await recordTaskChanged(context, task("completed"), task("todo"));
    await recordTaskChanged(context, task("todo", "2026-01-01T11:00:00Z"), task("completed"));

    expect(mocks.createTimelineEventMock).toHaveBeenNthCalledWith(1, context, expect.objectContaining({ event_type: "task_completed" }));
    expect(mocks.createTimelineEventMock).toHaveBeenNthCalledWith(2, context, expect.objectContaining({ event_type: "task_reopened" }));
  });

  it("does not fail the main action when timeline recording fails", async () => {
    const { recordTaskChanged } = await import("@/services/timeline-service");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.createTimelineEventMock.mockRejectedValue(new Error("RLS denied"));

    await expect(recordTaskChanged(context, task("todo"))).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
