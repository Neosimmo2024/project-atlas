import type { TenantContext } from "@/types/domain";
import { createRelationship, findPotentialRelationshipDuplicates } from "@/repositories/relationships";
import type { RelationshipFormInput } from "@/features/relationships/validation";

function recruitingInput(personId: string, organizationId: string): RelationshipFormInput {
  return {
    person_id: personId,
    organization_id: organizationId,
    relationship_type: "recruiting",
    pipeline_stage: "detection",
    status: "active",
    owner_user_id: null,
    score: null,
    confidence: null,
    started_at: null,
    ended_at: null,
    next_action_at: null,
    last_interaction_at: null,
    notes: null,
    tags: [],
    metadata: { source: "person_creation", lot: "9F" }
  };
}

export async function ensureRecruitingRelationshipForPerson(context: TenantContext, personId: string, organizationId: string) {
  const input = recruitingInput(personId, organizationId);
  const duplicates = await findPotentialRelationshipDuplicates(context, input);
  if (duplicates.length > 0) return duplicates[0].relationship;
  return createRelationship(context, input);
}
