import type { RecruitmentEmailSequenceStatus } from "@/types/domain";

export const RECRUITMENT_EMAIL_STATUS_LABELS: Record<RecruitmentEmailSequenceStatus | "none", string> = {
  none: "Non inscrite",
  pending: "À envoyer",
  sent: "Envoyée",
  error: "Erreur",
  stopped: "Arrêtée"
};
