import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Relationship, TenantContext } from "@/types/domain";
import type {
  RecruitmentPipelineDoNotContactInput,
  RecruitmentPipelineOwnerInput,
  RecruitmentPipelineTransitionInput
} from "@/features/recruitment-pipeline/validation";

export class RecruitmentPipelineError extends Error {
  constructor(message: string, public status = 400, public code = "RECRUITMENT_PIPELINE_ERROR") {
    super(message);
    this.name = "RecruitmentPipelineError";
  }
}

function mapPostgresError(error: { message?: string; code?: string }) {
  const message = error.message ?? "Erreur inconnue du pipeline de recrutement.";
  if (message.includes("not found")) return new RecruitmentPipelineError(message, 404, "RELATIONSHIP_NOT_FOUND");
  if (message.includes("stale") || message.includes("modified since")) return new RecruitmentPipelineError(message, 409, "RELATIONSHIP_CONFLICT");
  if (message.includes("Insufficient") || message.includes("Only owner")) return new RecruitmentPipelineError(message, 403, "RELATIONSHIP_FORBIDDEN");
  return new RecruitmentPipelineError(message, 400, error.code ?? "RECRUITMENT_PIPELINE_ERROR");
}

export async function transitionRecruitmentPipeline(
  context: TenantContext,
  relationshipId: string,
  input: RecruitmentPipelineTransitionInput
): Promise<Relationship> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("transition_recruitment_pipeline", {
    p_relationship_id: relationshipId,
    p_tenant_id: context.tenantId,
    p_to_stage: input.toStage,
    p_expected_stage: input.expectedStage ?? null,
    p_expected_updated_at: input.expectedUpdatedAt ?? null,
    p_confirmed: input.confirmed,
    p_reason: input.reason,
    p_signature_at: input.signatureAt ?? null,
    p_start_at: input.startAt ?? null,
    p_rejection_reason: input.rejectionReason ?? null,
    p_rejection_comment: input.rejectionComment,
    p_rejection_recontactable: input.rejectionRecontactable ?? null,
    p_rejection_follow_up_at: input.rejectionFollowUpAt ?? null,
    p_do_not_contact: input.doNotContact ?? null,
    p_metadata: input.metadata
  });

  if (error) throw mapPostgresError(error);
  return data as Relationship;
}

export async function assignRelationshipOwner(
  context: TenantContext,
  relationshipId: string,
  input: RecruitmentPipelineOwnerInput
): Promise<Relationship> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("assign_relationship_owner", {
    p_relationship_id: relationshipId,
    p_tenant_id: context.tenantId,
    p_owner_user_id: input.ownerUserId,
    p_expected_updated_at: input.expectedUpdatedAt ?? null,
    p_reason: input.reason
  });

  if (error) throw mapPostgresError(error);
  return data as Relationship;
}

export async function setRelationshipDoNotContact(
  context: TenantContext,
  relationshipId: string,
  input: RecruitmentPipelineDoNotContactInput
): Promise<Relationship> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("set_relationship_do_not_contact", {
    p_relationship_id: relationshipId,
    p_tenant_id: context.tenantId,
    p_do_not_contact: input.doNotContact,
    p_justification: input.justification,
    p_expected_updated_at: input.expectedUpdatedAt ?? null
  });

  if (error) throw mapPostgresError(error);
  return data as Relationship;
}
