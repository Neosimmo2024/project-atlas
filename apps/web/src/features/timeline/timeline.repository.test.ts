import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/types/domain";

const mocks = vi.hoisted(() => ({
  fromMock: vi.fn(),
  insertMock: vi.fn(),
  selectMock: vi.fn(),
  eqMock: vi.fn(),
  isMock: vi.fn(),
  orderMock: vi.fn(),
  rangeMock: vi.fn(),
  inMock: vi.fn(),
  singleMock: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({ from: mocks.fromMock }))
}));

const context: TenantContext = {
  tenantId: "tenant-a",
  tenant: { id: "tenant-a", name: "Tenant A" },
  userId: "user-a",
  role: "owner"
};

describe("timeline repository", () => {
  beforeEach(() => {
    mocks.fromMock.mockReset();
    mocks.insertMock.mockReset();
    mocks.selectMock.mockReset();
    mocks.eqMock.mockReset();
    mocks.isMock.mockReset();
    mocks.orderMock.mockReset();
    mocks.rangeMock.mockReset();
    mocks.inMock.mockReset();
    mocks.singleMock.mockReset();
    mocks.fromMock.mockReturnValue({ insert: mocks.insertMock });
    mocks.insertMock.mockReturnValue({ select: mocks.selectMock });
    mocks.selectMock.mockReturnValue({ single: mocks.singleMock });
  });

  it("creates an event with tenant context and idempotency key", async () => {
    const { createTimelineEvent } = await import("@/repositories/timeline-events");
    mocks.singleMock.mockResolvedValue({ data: { id: "event-1" }, error: null });

    await createTimelineEvent(context, {
      event_type: "person_created",
      title: "Renato Ponzio",
      person_id: "person-1",
      source_type: "person",
      source_id: "person-1",
      idempotency_key: "person_created:person-1"
    });

    expect(mocks.fromMock).toHaveBeenCalledWith("timeline_events");
    expect(mocks.insertMock).toHaveBeenCalledWith(expect.objectContaining({
      tenant_id: "tenant-a",
      created_by: "user-a",
      idempotency_key: "person_created:person-1"
    }));
  });

  it("ignores duplicate idempotency conflicts", async () => {
    const { createTimelineEvent } = await import("@/repositories/timeline-events");
    mocks.singleMock.mockResolvedValue({ data: null, error: { code: "23505", message: "duplicate key" } });

    const result = await createTimelineEvent(context, {
      event_type: "person_created",
      title: "Renato Ponzio",
      person_id: "person-1",
      source_type: "person",
      source_id: "person-1",
      idempotency_key: "person_created:person-1"
    });

    expect(result).toBeNull();
  });

  it("resolves authors in a single profiles query for the page", async () => {
    const { listTimelineEvents } = await import("@/repositories/timeline-events");
    const eventsQuery = { select: mocks.selectMock };
    const profilesQuery = { select: vi.fn(() => ({ in: mocks.inMock })) };
    mocks.fromMock
      .mockReturnValueOnce(eventsQuery)
      .mockReturnValueOnce(profilesQuery);
    mocks.selectMock.mockReturnValue({ eq: mocks.eqMock });
    mocks.eqMock.mockReturnValue({ is: mocks.isMock });
    mocks.isMock.mockReturnValue({ order: mocks.orderMock });
    mocks.orderMock.mockReturnValueOnce({ order: mocks.orderMock }).mockReturnValueOnce({ range: mocks.rangeMock });
    mocks.rangeMock.mockResolvedValue({
      data: [
        {
          id: "event-1",
          tenant_id: "tenant-a",
          event_type: "task_created",
          title: "Relancer",
          description: null,
          occurred_at: "2026-01-01T00:00:00Z",
          created_at: "2026-01-01T00:00:00Z",
          created_by: "user-a",
          person_id: null,
          organization_id: null,
          relationship_id: null,
          interaction_id: null,
          task_id: "task-1",
          source_type: "task",
          source_id: "task-1",
          metadata: {},
          visibility: "tenant",
          deleted_at: null,
          idempotency_key: "task_created:task-1",
          tasks: { id: "task-1", title: "Relancer", status: "todo" }
        }
      ],
      error: null,
      count: 1
    });
    mocks.inMock.mockResolvedValue({ data: [{ id: "user-a", full_name: "Renato Ponzio", email: "renato@example.com" }], error: null });

    const result = await listTimelineEvents(context, {});

    expect(mocks.fromMock).toHaveBeenNthCalledWith(2, "profiles");
    expect(mocks.inMock).toHaveBeenCalledWith("id", ["user-a"]);
    expect(result.events[0].author?.name).toBe("Renato Ponzio");
  });
});
