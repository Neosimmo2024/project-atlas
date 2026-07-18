import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionPlanItem, TenantContext } from "@/types/domain";

const mocks = vi.hoisted(() => ({
  fromMock: vi.fn(),
  buildActionPlanMock: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({ from: mocks.fromMock }))
}));

vi.mock("@/features/action-plan/engine", () => ({
  buildActionPlan: mocks.buildActionPlanMock
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

function organizationQuery(data: unknown) {
  const maybeSingle = vi.fn().mockResolvedValue({ data, error: null });
  const eqId = vi.fn().mockReturnValue({ maybeSingle });
  const eqTenant = vi.fn().mockReturnValue({ eq: eqId });
  return { select: vi.fn().mockReturnValue({ eq: eqTenant }), eqTenant, eqId, maybeSingle };
}

function relationshipsQuery(data: unknown[]) {
  const limit = vi.fn().mockResolvedValue({ data, error: null });
  const eqStatus = vi.fn().mockReturnValue({ limit });
  const eqOrganization = vi.fn().mockReturnValue({ eq: eqStatus });
  const eqTenant = vi.fn().mockReturnValue({ eq: eqOrganization });
  return { select: vi.fn().mockReturnValue({ eq: eqTenant }), limit };
}

function tasksQuery(data: unknown[]) {
  const limit = vi.fn().mockResolvedValue({ data, error: null });
  const not = vi.fn().mockReturnValue({ limit });
  const isDeleted = vi.fn().mockReturnValue({ not });
  const eqTenant = vi.fn().mockReturnValue({ is: isDeleted });
  return { select: vi.fn().mockReturnValue({ eq: eqTenant }), limit };
}

function decisionsQuery(data: unknown[]) {
  const limit = vi.fn().mockResolvedValue({ data, error: null });
  const eqUser = vi.fn().mockReturnValue({ limit });
  const eqOrganization = vi.fn().mockReturnValue({ eq: eqUser });
  const eqTenant = vi.fn().mockReturnValue({ eq: eqOrganization });
  return { select: vi.fn().mockReturnValue({ eq: eqTenant }), limit };
}

function interactionsQuery(data: unknown[]) {
  const limit = vi.fn().mockResolvedValue({ data, error: null });
  const order = vi.fn().mockReturnValue({ limit });
  const inRelationship = vi.fn().mockReturnValue({ order });
  const isDeleted = vi.fn().mockReturnValue({ in: inRelationship });
  const eqTenant = vi.fn().mockReturnValue({ is: isDeleted });
  return { select: vi.fn().mockReturnValue({ eq: eqTenant }), limit };
}

describe("action plan repository", () => {
  beforeEach(() => {
    mocks.fromMock.mockReset();
    mocks.buildActionPlanMock.mockReset();
    mocks.buildActionPlanMock.mockReturnValue([item]);
  });

  it("validates the requested organization inside the current tenant", async () => {
    const organization = organizationQuery(null);
    mocks.fromMock.mockReturnValueOnce(organization);
    const { getActionPlanForUser } = await import("../../repositories/action-plan");

    await expect(getActionPlanForUser(context, { organizationId: "missing" })).rejects.toThrow("L'organisation selectionnee est introuvable pour ce tenant.");
    expect(mocks.buildActionPlanMock).not.toHaveBeenCalled();
  });

  it("loads action plan sources in batches and delegates deterministic scoring", async () => {
    const organization = organizationQuery({ id: "organization-1" });
    const relationships = relationshipsQuery([{ id: "relationship-1", organization_id: "organization-1", status: "active" }]);
    const tasks = tasksQuery([]);
    const decisions = decisionsQuery([]);
    const interactions = interactionsQuery([]);
    mocks.fromMock
      .mockReturnValueOnce(organization)
      .mockReturnValueOnce(relationships)
      .mockReturnValueOnce(tasks)
      .mockReturnValueOnce(decisions)
      .mockReturnValueOnce(interactions);
    const { getActionPlanForUser } = await import("../../repositories/action-plan");

    const result = await getActionPlanForUser(context, { organizationId: "organization-1", now: new Date("2026-07-18T12:00:00Z") });

    expect(result).toEqual([item]);
    expect(mocks.fromMock).toHaveBeenCalledWith("organizations");
    expect(mocks.fromMock).toHaveBeenCalledWith("relationships");
    expect(mocks.fromMock).toHaveBeenCalledWith("tasks");
    expect(mocks.fromMock).toHaveBeenCalledWith("action_plan_decisions");
    expect(mocks.fromMock).toHaveBeenCalledWith("interactions");
    expect(mocks.buildActionPlanMock).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "organization-1",
      userId: "user-a",
      now: new Date("2026-07-18T12:00:00Z")
    }));
  });
});
