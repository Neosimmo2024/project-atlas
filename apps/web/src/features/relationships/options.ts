import { RECRUITMENT_PIPELINE_STAGE_LABELS, RECRUITMENT_PIPELINE_STAGES } from "@/features/recruitment-pipeline/options";

export const RELATIONSHIP_TYPES = [
  "recruiting",
  "management",
  "partnership",
  "customer",
  "supplier",
  "referrer",
  "prospecting"
] as const;

export const RELATIONSHIP_PIPELINE_STAGES = [
  ...RECRUITMENT_PIPELINE_STAGES
] as const;

export const RELATIONSHIP_STATUSES = ["active", "paused", "won", "lost", "archived"] as const;

export const RELATIONSHIP_TYPE_LABELS: Record<(typeof RELATIONSHIP_TYPES)[number], string> = {
  recruiting: "Recrutement",
  management: "Management",
  partnership: "Partenariat",
  customer: "Client",
  supplier: "Fournisseur",
  referrer: "Apporteur",
  prospecting: "Prospection"
};

export const RELATIONSHIP_PIPELINE_STAGE_LABELS = RECRUITMENT_PIPELINE_STAGE_LABELS;

export const RELATIONSHIP_STATUS_LABELS: Record<(typeof RELATIONSHIP_STATUSES)[number], string> = {
  active: "Active",
  paused: "En pause",
  won: "Gagnée",
  lost: "Perdue",
  archived: "Archivée"
};
