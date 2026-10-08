export const LYON_CAMPAIGN_MARKER = "[projet-lyon-neos-20261007]";

export function isLyonRecruitmentProfile(comments?: string | null) {
  return Boolean(comments?.includes(LYON_CAMPAIGN_MARKER));
}

// Lyon remains a draft until its own templates and recipient list are approved
// for launch. Never fall back to the tenant's national recruitment templates.
export const LYON_EMAIL_POLICY = {
  key: "lyon-development",
  labels: ["Email initial", "Relance J+17", "Dernier suivi J+32"],
  days: [0, 17, 32],
  sendingEnabled: false,
  blockedReason: "Campagne Lyon en brouillon : aucun envoi ni programmation. Les modèles Lyon doivent être raccordés à une séquence dédiée avant le lancement."
} as const;

export const NATIONAL_EMAIL_POLICY = {
  key: "national-recruitment",
  labels: ["Email initial", "Relance J+3", "Relance J+7"],
  days: [0, 3, 7],
  sendingEnabled: true,
  blockedReason: null
} as const;

export function recruitmentEmailPolicy(comments?: string | null) {
  return isLyonRecruitmentProfile(comments) ? LYON_EMAIL_POLICY : NATIONAL_EMAIL_POLICY;
}
