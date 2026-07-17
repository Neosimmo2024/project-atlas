import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/types/domain";

const mocks = vi.hoisted(() => ({
  fromMock: vi.fn(),
  insertMock: vi.fn(),
  selectMock: vi.fn(),
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
});
