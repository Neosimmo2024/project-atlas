import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionPlanItem, TenantContext } from "@/types/domain";

const mocks = vi.hoisted(() => ({
  getActionPlanForUserMock: vi.fn(),
  getTenantContextMock: vi.fn()
}));

vi.mock("@/repositories/action-plan", () => ({
  getActionPlanForUser: mocks.getActionPlanForUserMock
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

const item: ActionPlanItem = {
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
  availableActions: ["complete", "snooze", "open"],
  createdAt: "2026-07-01T08:00:00Z"
};

describe("action plan API", () => {
  beforeEach(() => {
    mocks.getActionPlanForUserMock.mockReset();
    mocks.getTenantContextMock.mockReset();
    mocks.getTenantContextMock.mockResolvedValue(context);
  });

  it("returns 401 without tenant context", async () => {
    const { GET } = await import("../../app/api/action-plan/route");
    mocks.getTenantContextMock.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/action-plan?organizationId=organization-1"));

    expect(response.status).toBe(401);
  });

  it("requires an organization id", async () => {
    const { GET } = await import("../../app/api/action-plan/route");

    const response = await GET(new Request("http://localhost/api/action-plan"));

    expect(response.status).toBe(400);
  });

  it("validates now and returns the computed action plan", async () => {
    const { GET } = await import("../../app/api/action-plan/route");
    mocks.getActionPlanForUserMock.mockResolvedValue([item]);

    const response = await GET(new Request("http://localhost/api/action-plan?organizationId=organization-1&now=2026-07-18T12:00:00Z"));
    const body = await response.json() as { data: ActionPlanItem[] };

    expect(response.status).toBe(200);
    expect(body.data).toEqual([item]);
    expect(mocks.getActionPlanForUserMock).toHaveBeenCalledWith(context, {
      organizationId: "organization-1",
      now: new Date("2026-07-18T12:00:00Z")
    });
  });

  it("rejects invalid now values", async () => {
    const { GET } = await import("../../app/api/action-plan/route");

    const response = await GET(new Request("http://localhost/api/action-plan?organizationId=organization-1&now=not-a-date"));

    expect(response.status).toBe(400);
  });
});
