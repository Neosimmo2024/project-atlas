import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionPlanItem, TenantContext } from "@/types/domain";
import type { ActionPlanRequest } from "../../repositories/action-plan";

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

function pagedResult(data: unknown[]) {
  const range = vi.fn(async (from: number, to: number) => ({
    data: data.slice(from, to + 1),
    error: null
  }));

  return { range };
}

function organizationQuery(data: unknown) {
  const maybeSingle = vi.fn().mockResolvedValue({ data, error: null });
  const eqId = vi.fn().mockReturnValue({ maybeSingle });
  const eqTenant = vi.fn().mockReturnValue({ eq: eqId });
  return { select: vi.fn().mockReturnValue({ eq: eqTenant }), eqTenant, eqId, maybeSingle };
}

function relationshipsQuery(data: unknown[]) {
  const result = pagedResult(data);
  const order = vi.fn().mockReturnValue(result);
  const eqOrganization = vi.fn().mockReturnValue({ order });
  const eqTenant = vi.fn().mockReturnValue({ eq: eqOrganization });
  return { select: vi.fn().mockReturnValue({ eq: eqTenant }), order, range: result.range };
}

function tasksQuery(data: unknown[]) {
  const result = pagedResult(data);
  const order = vi.fn().mockReturnValue(result);
  const or = vi.fn().mockReturnValue({ order });
  const eqOrganization = vi.fn().mockReturnValue({ order });
  const not = vi.fn().mockReturnValue({ or, eq: eqOrganization });
  const isDeleted = vi.fn().mockReturnValue({ not });
  const eqTenant = vi.fn().mockReturnValue({ is: isDeleted });
  return { select: vi.fn().mockReturnValue({ eq: eqTenant }), or, eqOrganization, order, range: result.range };
}

function decisionsQuery(data: unknown[]) {
  const result = pagedResult(data);
  const order = vi.fn().mockReturnValue(result);
  const eqUser = vi.fn().mockReturnValue({ order });
  const eqOrganization = vi.fn().mockReturnValue({ eq: eqUser });
  const eqTenant = vi.fn().mockReturnValue({ eq: eqOrganization });
  return { select: vi.fn().mockReturnValue({ eq: eqTenant }), eqUser, order, range: result.range };
}

function interactionsQuery(data: unknown[]) {
  const result = pagedResult(data);
  const ordered = { order: vi.fn(), range: result.range };
  const order = vi.fn().mockReturnValue(ordered);
  ordered.order.mockReturnValue(ordered);
  const inRelationship = vi.fn().mockReturnValue({ order });
  const isDeleted = vi.fn().mockReturnValue({ in: inRelationship });
  const eqTenant = vi.fn().mockReturnValue({ is: isDeleted });
  return { select: vi.fn().mockReturnValue({ eq: eqTenant }), order, secondOrder: ordered.order, range: result.range };
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
    expect(tasks.or).toHaveBeenCalledWith("organization_id.eq.organization-1,relationship_id.in.(relationship-1)");
    expect(relationships.order).toHaveBeenCalledWith("id", { ascending: true });
    expect(tasks.order).toHaveBeenCalledWith("id", { ascending: true });
    expect(decisions.order).toHaveBeenCalledWith("id", { ascending: true });
    expect(interactions.order).toHaveBeenCalledWith("interaction_date", { ascending: false });
    expect(interactions.secondOrder).toHaveBeenCalledWith("id", { ascending: true });
  });

  it("filters tasks in Supabase before execution instead of applying a global tenant limit", async () => {
    const organization = organizationQuery({ id: "organization-1" });
    const relationships = relationshipsQuery(Array.from({ length: 1001 }, (_, index) => ({
      id: `relationship-${index + 1}`,
      organization_id: "organization-1",
      status: "active"
    })));
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

    await getActionPlanForUser(context, { organizationId: "organization-1" });

    expect(tasks.or).toHaveBeenCalledWith(expect.stringContaining("organization_id.eq.organization-1"));
    expect(tasks.or).toHaveBeenCalledWith(expect.stringContaining("relationship_id.in.(relationship-1"));
    expect(interactions.order).toHaveBeenCalledWith("interaction_date", { ascending: false });
    expect(relationships.range).toHaveBeenCalledWith(0, 999);
    expect(relationships.range).toHaveBeenCalledWith(1000, 1999);
    expect(tasks.range).toHaveBeenCalledWith(0, 999);
    expect(interactions.range).toHaveBeenCalledWith(0, 999);
  });

  it("uses the authenticated context user and ignores a userId override on the request object", async () => {
    const organization = organizationQuery({ id: "organization-1" });
    const relationships = relationshipsQuery([]);
    const tasks = tasksQuery([]);
    const decisions = decisionsQuery([]);
    mocks.fromMock
      .mockReturnValueOnce(organization)
      .mockReturnValueOnce(relationships)
      .mockReturnValueOnce(tasks)
      .mockReturnValueOnce(decisions);
    const { getActionPlanForUser } = await import("../../repositories/action-plan");
    const maliciousRequest = {
      organizationId: "organization-1",
      userId: "other-user"
    } as unknown as ActionPlanRequest;

    await getActionPlanForUser(context, maliciousRequest);

    expect(decisions.eqUser).toHaveBeenCalledWith("user_id", "user-a");
    expect(mocks.buildActionPlanMock).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-a" }));
  });

  it("loads inactive organization relationships so relationship-scoped tasks stay in scope", async () => {
    const organization = organizationQuery({ id: "organization-1" });
    const relationships = relationshipsQuery([{ id: "relationship-paused", organization_id: "organization-1", status: "paused" }]);
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

    await getActionPlanForUser(context, { organizationId: "organization-1" });

    expect(tasks.or).toHaveBeenCalledWith("organization_id.eq.organization-1,relationship_id.in.(relationship-paused)");
  });
});
