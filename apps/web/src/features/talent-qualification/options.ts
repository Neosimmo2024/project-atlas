import type { QualificationConclusion, QualificationState } from "@/types/domain";

export const QUALIFICATION_STATES = ["none", "draft", "completed"] as const;

export const QUALIFICATION_STATE_LABELS: Record<QualificationState | "none", string> = {
  none: "À commencer",
  draft: "Brouillon",
  completed: "Terminée"
};

export const QUALIFICATION_CONCLUSIONS = ["continue", "deepen", "not_retained"] as const;

export const QUALIFICATION_CONCLUSION_LABELS: Record<QualificationConclusion, string> = {
  continue: "À poursuivre",
  deepen: "À approfondir",
  not_retained: "Non retenu"
};
