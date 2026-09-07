import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PipelineFilters } from "./pipeline-ui";

type QueryResult = { data: unknown[]; error: null; count?: number };
type QueryCall = { method: string; args: unknown[] };

class QueryMock {
  readonly calls: QueryCall[] = [];

  constructor(private readonly result: QueryResult = { data: [], error: null, count: 0 }) {}

  select(...args: unknown[]) { this.calls.push({ method: "select", args }); return this; }
  eq(...args: unknown[]) { this.calls.push({ method: "eq", args }); return this; }
  in(...args: unknown[]) { this.calls.push({ method: "in", args }); return Promise.resolve(this.result); }
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

function relationshipRow(overrides: Record<string, unknown> = {}) {
  return {
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
    organizations: { id: "organization-a", name: "Atlas QA", city: "Paris", do_not_contact: false },
    ...overrides
  };
}

function installQueries(input: {
  relationships: QueryMock;
  owners?: QueryMock;
  sequences?: QueryMock;
  tasks?: QueryMock;
}) {
  const owners = input.owners ?? new QueryMock({ data: [], error: null });
  const sequences = input.sequences ?? new QueryMock({ data: [], error: null });
  const tasks = input.tasks ?? new QueryMock({ data: [], error: null });
  mocks.from.mockImplementation((table: string) => {
    if (table === "relationships") return input.relationships;
    if (table === "tenant_users") return owners;
    if (table === "recruitment_email_sequences") return sequences;
    if (table === "tasks") return tasks;
    return new QueryMock();
  });
}

describe("recruitment pipeline repository", () => {
  beforeEach(() => {
    mocks.from.mockReset();
  });

  it("applies deterministic ordering and pagination in the Supabase query", async () => {
    const relationships = new QueryMock({
      data: [relationshipRow()],
      error: null,
      count: 50
    });
    const owners = new QueryMock({ data: [{ user_id: "user-a", roles: { slug: "owner", label: "Owner" } }], error: null });
    installQueries({ relationships, owners });

    const { listRecruitmentPipeline } = await import("@/repositories/recruitment-pipeline");
    const result = await listRecruitmentPipeline(
      { tenantId: "tenant-a", tenant: { id: "tenant-a", name: "Tenant A" }, userId: "user-a", role: "owner" },
      { ...baseFilters, stage: "qualification", ownerId: "user-a", nextAction: "today" }
    );

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.signatureScheduled).toBe(false);
    expect(result.cards[0]?.operationalPriority).toBe(0);
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
      data: [relationshipRow({
        id: "relationship-signature",
        pipeline_stage: "signature",
        owner_user_id: null,
        metadata: { recruitment_pipeline: { signature: { scheduled: true } } }
      })],
      error: null,
      count: 1
    });
    installQueries({ relationships });

    const { listRecruitmentPipeline } = await import("@/repositories/recruitment-pipeline");
    const result = await listRecruitmentPipeline(
      { tenantId: "tenant-a", tenant: { id: "tenant-a", name: "Tenant A" }, userId: "user-a", role: "owner" },
      baseFilters
    );

    expect(result.cards[0]?.signatureScheduled).toBe(true);
  });

  it("raises an open candidate reply task above other operational signals", async () => {
    const relationships = new QueryMock({ data: [relationshipRow()], error: null, count: 1 });
    const sequences = new QueryMock({
      data: [{
        person_id: "person-a",
        status: "stopped",
        lifecycle_status: "stopped",
        current_step: 1,
        next_action_at: null,
        stop_reason: "candidate_reply"
      }],
      error: null
    });
    const tasks = new QueryMock({
      data: [{
        person_id: "person-a",
        relationship_id: "relationship-a",
        status: "todo",
        due_at: "2026-07-19T08:00:00Z",
        reason: "candidate_reply",
        metadata: { source: "recruitment_candidate_reply" },
        updated_at: "2026-07-19T08:00:00Z"
      }],
      error: null
    });
    installQueries({ relationships, sequences, tasks });

    const { listRecruitmentPipeline } = await import("@/repositories/recruitment-pipeline");
    const result = await listRecruitmentPipeline(
      { tenantId: "tenant-a", tenant: { id: "tenant-a", name: "Tenant A" }, userId: "user-a", role: "owner" },
      baseFilters
    );

    expect(result.cards[0]?.operationalPriority).toBe(400);
    expect(result.cards[0]?.nextActionAt).toBe("2026-07-19T08:00:00Z");
    expect(result.cards[0]?.recruitmentSequenceLabel).toBe("Réponse reçue · séquence arrêtée");
  });
});
