import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PipelineFilters } from "./pipeline-ui";

type QueryResult = { data: unknown[]; error: null; count?: number };
type QueryCall = { method: string; args: unknown[] };

class QueryMock {
  readonly calls: QueryCall[] = [];

  constructor(private readonly result: QueryResult = { data: [], error: null, count: 0 }) {}

  select(...args: unknown[]) { this.calls.push({ method: "select", args }); return this; }
  eq(...args: unknown[]) { this.calls.push({ method: "eq", args }); return this; }
  is(...args: unknown[]) { this.calls.push({ method: "is", args }); return this; }
  or(...args: unknown[]) { this.calls.push({ method: "or", args }); return this; }
  not(...args: unknown[]) { this.calls.push({ method: "not", args }); return this; }
  lt(...args: unknown[]) { this.calls.push({ method: "lt", args }); return this; }
  gte(...args: unknown[]) { this.calls.push({ method: "gte", args }); return this; }
  contains(...args: unknown[]) { this.calls.push({ method: "contains", args }); return this; }
  order(...args: unknown[]) { this.calls.push({ method: "order", args }); return this; }
  limit(...args: unknown[]) { this.calls.push({ method: "limit", args }); return Promise.resolve(this.result); }
  range(...args: unknown[]) { this.calls.push({ method: "range", args }); return Promise.resolve(this.result); }
}

const mocks = vi.hoisted(() => ({
  from: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({ from: mocks.from }))
}));

const baseFilters: PipelineFilters = {
  query: "",
  stage: "",
  ownerId: "",
  noOwner: false,
  nextAction: "",
  contact: "",
  recontactable: "",
  view: "kanban",
  page: 2,
  pageSize: 25
};

describe("recruitment pipeline repository", () => {
  beforeEach(() => {
    mocks.from.mockReset();
  });

  it("applies deterministic ordering and pagination in the Supabase query", async () => {
    const relationships = new QueryMock({
      data: [{
        id: "relationship-a",
        tenant_id: "tenant-a",
        person_id: "person-a",
        organization_id: "organization-a",
        relationship_type: "recruiting",
        pipeline_stage: "qualification",
        status: "active",
        owner_user_id: "user-a",
        score: null,
        confidence: null,
        next_action_at: null,
        started_at: null,
        ended_at: null,
        last_interaction_at: null,
        notes: null,
        tags: [],
        metadata: {},
        created_at: "2026-07-19T08:00:00Z",
        updated_at: "2026-07-19T09:00:00Z",
        people: { id: "person-a", display_name: "Florence Martin", city: "Paris", do_not_contact: false },
        organizations: { id: "organization-a", name: "Atlas QA", city: "Paris", do_not_contact: false }
      }],
      error: null,
      count: 50
    });
    const owners = new QueryMock({ data: [{ user_id: "user-a", roles: { slug: "owner", label: "Owner" } }], error: null });

    mocks.from.mockImplementation((table: string) => table === "relationships" ? relationships : owners);

    const { listRecruitmentPipeline } = await import("@/repositories/recruitment-pipeline");
    const result = await listRecruitmentPipeline(
      { tenantId: "tenant-a", tenant: { id: "tenant-a", name: "Tenant A" }, userId: "user-a", role: "owner" },
      { ...baseFilters, stage: "qualification", ownerId: "user-a", nextAction: "today" }
    );

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.signatureScheduled).toBe(false);
    expect(result.page).toBe(2);
    expect(relationships.calls).toEqual(expect.arrayContaining([
      { method: "eq", args: ["tenant_id", "tenant-a"] },
      { method: "eq", args: ["pipeline_stage", "qualification"] },
      { method: "eq", args: ["owner_user_id", "user-a"] },
      { method: "order", args: ["pipeline_stage", { ascending: true }] },
      { method: "order", args: ["updated_at", { ascending: false }] },
      { method: "order", args: ["id", { ascending: true }] },
      { method: "range", args: [25, 49] }
    ]));
    expect(relationships.calls.some((call) => call.method === "gte" && call.args[0] === "next_action_at")).toBe(true);
    expect(relationships.calls.some((call) => call.method === "lt" && call.args[0] === "next_action_at")).toBe(true);
  });

  it("marks future signatures as scheduled from relationship metadata", async () => {
    const relationships = new QueryMock({
      data: [{
        id: "relationship-signature",
        tenant_id: "tenant-a",
        person_id: "person-a",
        organization_id: "organization-a",
        relationship_type: "recruiting",
        pipeline_stage: "signature",
        status: "active",
        owner_user_id: null,
        score: null,
        confidence: null,
        next_action_at: null,
        started_at: null,
        ended_at: null,
        last_interaction_at: null,
        notes: null,
        tags: [],
        metadata: { recruitment_pipeline: { signature: { scheduled: true } } },
        created_at: "2026-07-19T08:00:00Z",
        updated_at: "2026-07-19T09:00:00Z",
        people: { id: "person-a", display_name: "Florence Martin", city: "Paris", do_not_contact: false },
        organizations: { id: "organization-a", name: "Atlas QA", city: "Paris", do_not_contact: false }
      }],
      error: null,
      count: 1
    });
    const owners = new QueryMock({ data: [], error: null });

    mocks.from.mockImplementation((table: string) => table === "relationships" ? relationships : owners);

    const { listRecruitmentPipeline } = await import("@/repositories/recruitment-pipeline");
    const result = await listRecruitmentPipeline(
      { tenantId: "tenant-a", tenant: { id: "tenant-a", name: "Tenant A" }, userId: "user-a", role: "owner" },
      baseFilters
    );

    expect(result.cards[0]?.signatureScheduled).toBe(true);
  });
});
