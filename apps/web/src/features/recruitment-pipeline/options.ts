import type { RelationshipPipelineStage, RelationshipRejectionReason } from "@/types/domain";

export const RECRUITMENT_PIPELINE_STAGES = [
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
] as const satisfies readonly RelationshipPipelineStage[];

export const ACTIVE_RECRUITMENT_PIPELINE_STAGES = RECRUITMENT_PIPELINE_STAGES.filter((stage) => stage !== "rejected");

export const RECRUITMENT_PIPELINE_STAGE_LABELS: Record<RelationshipPipelineStage, string> = {
  detection: "Détection",
  qualification: "Qualification",
  first_contact: "Premier contact",
  conversation: "Conversation",
  appointment: "Rendez-vous",
  presentation: "Présentation",
  reflection: "Réflexion",
  negotiation: "Négociation",
  signature: "Signature",
  onboarding: "Intégration",
  development: "Développement",
  ambassador: "Ambassadeur",
  rejected: "Rejetée"
};

export const RECRUITMENT_REJECTION_REASONS = [
  "not_interested",
  "conditions",
  "current_network",
  "postponed",
  "profile_mismatch",
  "unresponsive",
  "duplicate",
  "other"
] as const satisfies readonly RelationshipRejectionReason[];

export const RECRUITMENT_REJECTION_REASON_LABELS: Record<RelationshipRejectionReason, string> = {
  not_interested: "Pas intéressé",
  conditions: "Conditions",
  current_network: "Réseau actuel",
  postponed: "Reporté",
  profile_mismatch: "Profil non adapté",
  unresponsive: "Sans réponse",
  duplicate: "Doublon",
  other: "Autre"
};

export function isRecruitmentPipelineStage(value: string): value is RelationshipPipelineStage {
  return RECRUITMENT_PIPELINE_STAGES.includes(value as RelationshipPipelineStage);
}

export function isRejectedStage(stage: RelationshipPipelineStage) {
  return stage === "rejected";
}
