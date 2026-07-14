export const ORGANIZATION_TYPES = [
  "network",
  "agency",
  "independent_agency",
  "franchise",
  "property_management",
  "developer",
  "brokerage",
  "training_company",
  "partner",
  "other"
] as const;

export const ORGANIZATION_STATUSES = ["active", "inactive", "archived"] as const;

export const ORGANIZATION_TYPE_LABELS: Record<(typeof ORGANIZATION_TYPES)[number], string> = {
  network: "Reseau",
  agency: "Agence",
  independent_agency: "Agence independante",
  franchise: "Franchise",
  property_management: "Gestion locative",
  developer: "Promoteur",
  brokerage: "Courtier",
  training_company: "Organisme de formation",
  partner: "Partenaire",
  other: "Autre"
};

export const ORGANIZATION_STATUS_LABELS: Record<(typeof ORGANIZATION_STATUSES)[number], string> = {
  active: "Active",
  inactive: "Inactive",
  archived: "Archivee"
};
