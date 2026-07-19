import type { ProjectLossReason, ProjectStage, ProjectStatus, ProjectType } from "@/types/domain";

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  recruitment: "Recrutement",
  property_sale: "Vente immobilière",
  rental_management: "Gestion locative",
  partnership: "Partenariat",
  training: "Formation",
  referral: "Recommandation",
  other: "Autre"
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  open: "Ouvert",
  won: "Gagné",
  lost: "Perdu"
};

export const PROJECT_STAGE_LABELS: Record<ProjectStage, string> = {
  new: "Nouveau",
  qualification: "Qualification",
  proposal: "Proposition",
  decision: "Décision"
};

export const PROJECT_LOSS_REASON_LABELS: Record<ProjectLossReason, string> = {
  price: "Prix",
  competition: "Concurrence",
  abandoned: "Projet abandonné",
  too_long: "Délai trop long",
  no_response: "Absence de réponse",
  bad_qualification: "Mauvaise qualification",
  conditions_rejected: "Conditions non acceptées",
  other: "Autre"
};
