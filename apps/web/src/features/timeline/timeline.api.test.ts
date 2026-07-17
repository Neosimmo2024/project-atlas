import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/types/domain";

const mocks = vi.hoisted(() => ({
  listTimelineEventsMock: vi.fn(),
  getTenantContextMock: vi.fn()
}));

vi.mock("@/repositories/timeline-events", () => ({
  listTimelineEvents: mocks.listTimelineEventsMock
}));

vi.mock("@/repositories/tenant-context", () => ({
  getTenantContext: mocks.getTenantContextMock
}));

const context: TenantContext = {
  tenantId: "tenant-a",
  tenant: { id: "tenant-a", name: "Tenant A" },
  userId: "user-a",
  role: "owner"
};

describe("timeline API", () => {
  beforeEach(() => {
    mocks.listTimelineEventsMock.mockReset();
    mocks.getTenantContextMock.mockReset();
    mocks.getTenantContextMock.mockResolvedValue(context);
  });

  it("returns 401 without tenant context", async () => {
    const { GET } = await import("../../app/api/timeline/route");
    mocks.getTenantContextMock.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/timeline"));

    expect(response.status).toBe(401);
  });

  it("lists events with filters and pagination", async () => {
    const { GET } = await import("../../app/api/timeline/route");
    mocks.listTimelineEventsMock.mockResolvedValue({ events: [], total: 0, page: 1, pageSize: 10, pageCount: 1 });

    const response = await GET(new Request("http://localhost/api/timeline?personId=person-1&category=tasks&page=1"));
    const body = await response.json() as { data: unknown[]; pagination: { total: number } };

    expect(response.status).toBe(200);
    expect(body.pagination.total).toBe(0);
    expect(mocks.listTimelineEventsMock).toHaveBeenCalledWith(context, expect.objectContaining({ personId: "person-1", category: "tasks" }));
  });
});
