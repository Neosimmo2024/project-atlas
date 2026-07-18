import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionPlanItem, TenantContext } from "@/types/domain";

const mocks = vi.hoisted(() => ({
  completeActionPlanTaskMock: vi.fn(),
  createActionPlanInteractionMock: vi.fn(),
  createActionPlanTaskFromRecommendationMock: vi.fn(),
  getActionPlanForUserMock: vi.fn(),
  getTenantContextMock: vi.fn(),
  planActionPlanTaskMock: vi.fn(),
  restoreActionPlanTaskMock: vi.fn(),
  snoozeActionPlanItemMock: vi.fn()
}));

vi.mock("@/repositories/action-plan", () => ({
  completeActionPlanTask: mocks.completeActionPlanTaskMock,
  createActionPlanInteraction: mocks.createActionPlanInteractionMock,
  createActionPlanTaskFromRecommendation: mocks.createActionPlanTaskFromRecommendationMock,
  getActionPlanForUser: mocks.getActionPlanForUserMock,
  planActionPlanTask: mocks.planActionPlanTaskMock,
  restoreActionPlanTask: mocks.restoreActionPlanTaskMock,
  snoozeActionPlanItem: mocks.snoozeActionPlanItemMock
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
    mocks.completeActionPlanTaskMock.mockReset();
    mocks.createActionPlanInteractionMock.mockReset();
    mocks.createActionPlanTaskFromRecommendationMock.mockReset();
    mocks.getTenantContextMock.mockReset();
    mocks.planActionPlanTaskMock.mockReset();
    mocks.restoreActionPlanTaskMock.mockReset();
    mocks.snoozeActionPlanItemMock.mockReset();
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

  it("completes a task through the authenticated tenant context", async () => {
    const { POST } = await import("../../app/api/action-plan/actions/route");
    mocks.completeActionPlanTaskMock.mockResolvedValue({ task: { id: "11111111-1111-4111-8111-111111111111" }, previousStatus: "todo", previousCompletedAt: null });

    const response = await POST(new Request("http://localhost/api/action-plan/actions", {
      method: "POST",
      body: JSON.stringify({ action: "complete_task", taskId: "11111111-1111-4111-8111-111111111111" })
    }));

    expect(response.status).toBe(200);
    expect(mocks.completeActionPlanTaskMock).toHaveBeenCalledWith(context, "11111111-1111-4111-8111-111111111111");
  });

  it("snoozes an item without planning a task due date", async () => {
    const { POST } = await import("../../app/api/action-plan/actions/route");
    mocks.snoozeActionPlanItemMock.mockResolvedValue({ id: "decision-1" });

    const response = await POST(new Request("http://localhost/api/action-plan/actions", {
      method: "POST",
      body: JSON.stringify({
        action: "snooze",
        itemId: "task:11111111-1111-4111-8111-111111111111",
        sourceType: "task",
        sourceId: "11111111-1111-4111-8111-111111111111",
        organizationId: "22222222-2222-4222-8222-222222222222",
        snoozedUntil: "2026-07-19T09:00:00.000Z"
      })
    }));

    expect(response.status).toBe(200);
    expect(mocks.snoozeActionPlanItemMock).toHaveBeenCalledWith(context, expect.not.objectContaining({ dueAt: expect.anything() }));
  });

  it("plans only the task due date when a task is undated", async () => {
    const { POST } = await import("../../app/api/action-plan/actions/route");
    mocks.planActionPlanTaskMock.mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111", due_at: "2026-07-18T18:00:00.000Z" });

    const response = await POST(new Request("http://localhost/api/action-plan/actions", {
      method: "POST",
      body: JSON.stringify({
        action: "plan_task",
        taskId: "11111111-1111-4111-8111-111111111111",
        dueAt: "2026-07-18T18:00:00.000Z"
      })
    }));

    expect(response.status).toBe(200);
    expect(mocks.planActionPlanTaskMock).toHaveBeenCalledWith(context, "11111111-1111-4111-8111-111111111111", "2026-07-18T18:00:00.000Z");
  });

  it("creates a lightweight interaction from a relationship recommendation", async () => {
    const { POST } = await import("../../app/api/action-plan/actions/route");
    mocks.createActionPlanInteractionMock.mockResolvedValue({ id: "33333333-3333-4333-8333-333333333333" });

    const response = await POST(new Request("http://localhost/api/action-plan/actions", {
      method: "POST",
      body: JSON.stringify({
        action: "add_interaction",
        itemId: "relationship_inactive:44444444-4444-4444-8444-444444444444",
        organizationId: "22222222-2222-4222-8222-222222222222",
        personId: "55555555-5555-4555-8555-555555555555",
        relationshipId: "44444444-4444-4444-8444-444444444444",
        typeId: "66666666-6666-4666-8666-666666666666",
        notes: "Compte rendu",
        interactionDate: "2026-07-18T12:00:00.000Z"
      })
    }));

    expect(response.status).toBe(201);
    expect(mocks.createActionPlanInteractionMock).toHaveBeenCalledWith(context, expect.objectContaining({
      itemId: "relationship_inactive:44444444-4444-4444-8444-444444444444",
      organizationId: "22222222-2222-4222-8222-222222222222",
      interaction: expect.objectContaining({
        title: "Échange ajouté depuis le Plan d’action",
        comments: "Compte rendu"
      })
    }));
  });

  it("creates a normal-priority task from a recommendation and waits for server confirmation", async () => {
    const { POST } = await import("../../app/api/action-plan/actions/route");
    mocks.createActionPlanTaskFromRecommendationMock.mockResolvedValue({ id: "77777777-7777-4777-8777-777777777777" });

    const response = await POST(new Request("http://localhost/api/action-plan/actions", {
      method: "POST",
      body: JSON.stringify({
        action: "create_task",
        itemId: "relationship_inactive:44444444-4444-4444-8444-444444444444",
        organizationId: "22222222-2222-4222-8222-222222222222",
        personId: "55555555-5555-4555-8555-555555555555",
        relationshipId: "44444444-4444-4444-8444-444444444444",
        title: "Relancer Renato Ponzio",
        dueAt: "2026-07-19T09:00:00.000Z"
      })
    }));

    expect(response.status).toBe(201);
    expect(mocks.createActionPlanTaskFromRecommendationMock).toHaveBeenCalledWith(context, expect.objectContaining({
      task: expect.objectContaining({
        title: "Relancer Renato Ponzio",
        priority: "normal",
        due_at: "2026-07-19T09:00:00.000Z",
        source_type: "relationship"
      })
    }));
  });
});
