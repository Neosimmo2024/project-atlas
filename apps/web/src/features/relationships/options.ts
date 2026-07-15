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
  "detection",
  "qualification",
  "first_contact",
  "conversation",
  "meeting",
  "presentation",
  "reflection",
  "negotiation",
  "signature",
  "onboarding",
  "development",
  "ambassador",
  "refusal",
  "closed"
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

export const RELATIONSHIP_PIPELINE_STAGE_LABELS: Record<(typeof RELATIONSHIP_PIPELINE_STAGES)[number], string> = {
  detection: "Detection",
  qualification: "Qualification",
  first_contact: "Premier contact",
  conversation: "Conversation",
  meeting: "Rendez-vous",
  presentation: "Presentation",
  reflection: "Reflexion",
  negotiation: "Negociation",
  signature: "Signature",
  onboarding: "Integration",
  development: "Developpement",
  ambassador: "Ambassadeur",
  refusal: "Refus",
  closed: "Cloturee"
};

export const RELATIONSHIP_STATUS_LABELS: Record<(typeof RELATIONSHIP_STATUSES)[number], string> = {
  active: "Active",
  paused: "En pause",
  won: "Gagnee",
  lost: "Perdue",
  archived: "Archivee"
};
