import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Relationship, TenantContext } from "@/types/domain";
import { RECRUITMENT_PIPELINE_STAGE_LABELS, RECRUITMENT_PIPELINE_STAGES } from "./options";
import { parseRecruitmentPipelineDoNotContact, parseRecruitmentPipelineOwner, parseRecruitmentPipelineTransition } from "./validation";

const supabaseMock = vi.hoisted(() => ({
  rpc: vi.fn(),
  createSupabaseServerClient: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: supabaseMock.createSupabaseServerClient
}));

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
  updated_at: "2026-07-19T08:00:00Z"
};

describe("recruitment pipeline domain", () => {
  beforeEach(() => {
    supabaseMock.rpc.mockReset();
    supabaseMock.createSupabaseServerClient.mockResolvedValue({ rpc: supabaseMock.rpc });
  });

  it("defines the official phases as the single source of truth", () => {
    expect(RECRUITMENT_PIPELINE_STAGES).toEqual([
      "detection",
      "qualification",
      "first_contact",
      "conversation",
      "appointment",
      "presentation",
      "reflection",
      "negotiation",
      "signature",
      "onboarding",
      "development",
      "ambassador",
      "rejected"
    ]);
    expect(RECRUITMENT_PIPELINE_STAGE_LABELS.appointment).toBe("Rendez-vous");
  });

  it("requires signature confirmation and date", () => {
    const result = parseRecruitmentPipelineTransition({ toStage: "signature", confirmed: true });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain("La signature exige une confirmation et une date de signature.");
  });

  it("requires rejected reason and an other comment", () => {
    const missingReason = parseRecruitmentPipelineTransition({ toStage: "rejected" });
    const missingComment = parseRecruitmentPipelineTransition({ toStage: "rejected", rejectionReason: "other" });

    expect(missingReason.success).toBe(false);
    expect(missingComment.success).toBe(false);
    expect(missingComment.error?.issues.map((issue) => issue.message)).toContain("Le motif autre exige un commentaire.");
  });

  it("validates owner and do-not-contact actions", () => {
    expect(parseRecruitmentPipelineOwner({ ownerUserId: null }).success).toBe(true);
    expect(parseRecruitmentPipelineDoNotContact({ doNotContact: true, justification: "" }).success).toBe(false);
  });

  it("sends transitions to the atomic Supabase RPC with context tenant only", async () => {
    supabaseMock.rpc.mockResolvedValue({ data: { ...relationship, pipeline_stage: "conversation" }, error: null });
    const { transitionRecruitmentPipeline } = await import("@/services/recruitment-pipeline-service");

    const result = await transitionRecruitmentPipeline(context, relationship.id, {
      toStage: "conversation",
      expectedStage: "qualification",
      expectedUpdatedAt: relationship.updated_at,
      confirmed: false,
      reason: null,
      signatureAt: null,
      startAt: null,
      rejectionComment: null,
      rejectionRecontactable: null,
      rejectionFollowUpAt: null,
      doNotContact: null,
      metadata: {}
    });

    expect(result.pipeline_stage).toBe("conversation");
    expect(supabaseMock.rpc).toHaveBeenCalledWith("transition_recruitment_pipeline", expect.objectContaining({
      p_tenant_id: context.tenantId,
      p_to_stage: "conversation",
      p_expected_stage: "qualification"
    }));
  });

  it("maps stale RPC errors to explicit conflicts", async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { message: "Relationship pipeline stage is stale.", code: "P0001" } });
    const { transitionRecruitmentPipeline } = await import("@/services/recruitment-pipeline-service");

    await expect(transitionRecruitmentPipeline(context, relationship.id, {
      toStage: "conversation",
      confirmed: false,
      reason: null,
      signatureAt: null,
      startAt: null,
      rejectionComment: null,
      rejectionRecontactable: null,
      rejectionFollowUpAt: null,
      doNotContact: null,
      metadata: {}
    })).rejects.toMatchObject({ status: 409, code: "RELATIONSHIP_CONFLICT" });
  });
});
