import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Relationship, TenantContext } from "@/types/domain";

const mocks = vi.hoisted(() => ({
  getTenantContext: vi.fn(),
  transitionRecruitmentPipeline: vi.fn(),
  assignRelationshipOwner: vi.fn(),
  setRelationshipDoNotContact: vi.fn()
}));

vi.mock("@/repositories/tenant-context", () => ({
  getTenantContext: mocks.getTenantContext
}));

vi.mock("@/services/recruitment-pipeline-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/recruitment-pipeline-service")>();
  return {
    ...actual,
    transitionRecruitmentPipeline: mocks.transitionRecruitmentPipeline,
    assignRelationshipOwner: mocks.assignRelationshipOwner,
    setRelationshipDoNotContact: mocks.setRelationshipDoNotContact
  };
});

const context: TenantContext = {
  tenantId: "tenant-a",
  tenant: { id: "tenant-a", name: "Tenant A" },
  userId: "user-a",
  role: "owner"
};

const relationship: Relationship = {
  id: "relationship-a",
  tenant_id: "tenant-a",
  person_id: "person-a",
  organization_id: "organization-a",
  relationship_type: "recruiting",
  pipeline_stage: "conversation",
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
  updated_at: "2026-07-19T09:00:00Z"
};

function request(body: unknown) {
  return new Request("http://localhost", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

const params = { params: Promise.resolve({ id: relationship.id }) };

describe("recruitment pipeline API", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getTenantContext.mockResolvedValue(context);
  });

  it("transitions with the authenticated tenant context and ignores browser tenant_id", async () => {
    const route = await import("../../app/api/relationships/[id]/pipeline/route");
    mocks.transitionRecruitmentPipeline.mockResolvedValue(relationship);

    const response = await route.PATCH(request({ tenant_id: "tenant-b", toStage: "conversation" }), params);

    expect(response.status).toBe(200);
    expect(mocks.transitionRecruitmentPipeline).toHaveBeenCalledWith(context, relationship.id, expect.objectContaining({ toStage: "conversation" }));
  });

  it("returns validation fields for invalid signature transitions", async () => {
    const route = await import("../../app/api/relationships/[id]/pipeline/route");

    const response = await route.PATCH(request({ toStage: "signature", confirmed: true }), params);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.fields).toEqual(expect.arrayContaining([expect.objectContaining({ field: "signatureAt" })]));
    expect(mocks.transitionRecruitmentPipeline).not.toHaveBeenCalled();
  });

  it("assigns owners through the dedicated endpoint", async () => {
    const route = await import("../../app/api/relationships/[id]/owner/route");
    mocks.assignRelationshipOwner.mockResolvedValue({ ...relationship, owner_user_id: "22222222-2222-4222-8222-222222222222" });

    const response = await route.PATCH(request({ ownerUserId: "22222222-2222-4222-8222-222222222222", reason: "Transfert" }), params);

    expect(response.status).toBe(200);
    expect(mocks.assignRelationshipOwner).toHaveBeenCalledWith(context, relationship.id, expect.objectContaining({ reason: "Transfert" }));
  });

  it("requires a justification for do-not-contact changes", async () => {
    const route = await import("../../app/api/relationships/[id]/do-not-contact/route");

    const response = await route.PATCH(request({ doNotContact: true, justification: "" }), params);

    expect(response.status).toBe(400);
    expect(mocks.setRelationshipDoNotContact).not.toHaveBeenCalled();
  });
});
