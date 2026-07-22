import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Relationship, TenantContext } from "@/types/domain";

const mocks = vi.hoisted(() => ({
  createRelationshipMock: vi.fn(),
  updateRelationshipMock: vi.fn(),
  findPotentialRelationshipDuplicatesMock: vi.fn(),
  getTenantContextMock: vi.fn()
}));

vi.mock("@/repositories/relationships", () => ({
  createRelationship: mocks.createRelationshipMock,
  deleteRelationship: vi.fn(),
  findPotentialRelationshipDuplicates: mocks.findPotentialRelationshipDuplicatesMock,
  getRelationshipDetail: vi.fn(),
  updateRelationship: mocks.updateRelationshipMock,
  listRelationships: vi.fn()
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

const relationship: Relationship = {
  id: "11111111-1111-4111-8111-111111111111",
  tenant_id: "tenant-a",
  person_id: "22222222-2222-4222-8222-222222222222",
  organization_id: "33333333-3333-4333-8333-333333333333",
  relationship_type: "recruiting",
  pipeline_stage: "detection",
  status: "active",
  owner_user_id: "user-a",
  score: null,
  confidence: null,
  started_at: null,
  ended_at: null,
  next_action_at: null,
  last_interaction_at: null,
  notes: "Relation de test",
  tags: [],
  metadata: {},
  created_at: "2026-07-22T08:00:00Z",
  updated_at: "2026-07-22T08:00:00Z"
};

function validPayload() {
  return {
    person_id: relationship.person_id,
    organization_id: relationship.organization_id,
    relationship_type: relationship.relationship_type,
    pipeline_stage: relationship.pipeline_stage,
    status: relationship.status,
    notes: relationship.notes
  };
}

describe("relationships API", () => {
  beforeEach(() => {
    mocks.createRelationshipMock.mockReset();
    mocks.updateRelationshipMock.mockReset();
    mocks.findPotentialRelationshipDuplicatesMock.mockReset();
    mocks.getTenantContextMock.mockReset();
    mocks.getTenantContextMock.mockResolvedValue(context);
    mocks.findPotentialRelationshipDuplicatesMock.mockResolvedValue([]);
  });

  it("creates a relationship using the authenticated tenant context", async () => {
    const { POST } = await import("../../app/api/relationships/route");
    mocks.createRelationshipMock.mockResolvedValue(relationship);

    const response = await POST(new Request("http://localhost/api/relationships", {
      method: "POST",
      body: JSON.stringify({ ...validPayload(), tenant_id: "malicious" })
    }));
    const body = await response.json() as { data: Relationship };

    expect(response.status).toBe(201);
    expect(body.data.id).toBe(relationship.id);
    expect(mocks.createRelationshipMock).toHaveBeenCalledWith(context, expect.not.objectContaining({ tenant_id: expect.anything() }));
  });

  it("blocks an active duplicate even when the browser sends confirmDuplicate", async () => {
    const { POST } = await import("../../app/api/relationships/route");
    mocks.findPotentialRelationshipDuplicatesMock.mockResolvedValue([{ relationship, reasons: ["active_identity"] }]);

    const response = await POST(new Request("http://localhost/api/relationships", {
      method: "POST",
      body: JSON.stringify({ ...validPayload(), confirmDuplicate: true })
    }));
    const body = await response.json() as { error: string; duplicates: unknown[] };

    expect(response.status).toBe(409);
    expect(body.error).toBe("Une relation active identique existe déjà pour cette personne, cette organisation et ce type.");
    expect(body.duplicates).toHaveLength(1);
    expect(mocks.createRelationshipMock).not.toHaveBeenCalled();
  });

  it("blocks an active duplicate during update even when confirmDuplicate is provided", async () => {
    const { PUT } = await import("../../app/api/relationships/[id]/route");
    mocks.findPotentialRelationshipDuplicatesMock.mockResolvedValue([{ relationship, reasons: ["active_identity"] }]);

    const response = await PUT(new Request(`http://localhost/api/relationships/${relationship.id}`, {
      method: "PUT",
      body: JSON.stringify({ ...validPayload(), confirmDuplicate: true })
    }), { params: Promise.resolve({ id: relationship.id }) });
    const body = await response.json() as { error: string; duplicates: unknown[] };

    expect(response.status).toBe(409);
    expect(body.error).toBe("Une relation active identique existe déjà pour cette personne, cette organisation et ce type.");
    expect(body.duplicates).toHaveLength(1);
    expect(mocks.updateRelationshipMock).not.toHaveBeenCalled();
  });
});
