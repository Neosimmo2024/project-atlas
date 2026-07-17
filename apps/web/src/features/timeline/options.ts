import type { TimelineEventType } from "@/types/domain";

export const TIMELINE_EVENT_LABELS: Record<TimelineEventType, string> = {
  person_created: "Personne créée",
  organization_created: "Organisation créée",
  relationship_created: "Relation créée",
  interaction_created: "Échange créé",
  interaction_updated: "Échange modifié",
  task_created: "Tâche créée",
  task_completed: "Tâche terminée",
  task_reopened: "Tâche rouverte",
  task_updated: "Tâche modifiée",
  task_deleted: "Tâche supprimée",
  organization_linked: "Organisation liée",
  organization_unlinked: "Organisation dissociée"
};

export const TIMELINE_FILTER_LABELS = {
  all: "Tous",
  interactions: "Échanges",
  tasks: "Tâches",
  relationships: "Relations",
  organizations: "Organisations"
} as const;

export type TimelineFilterCategory = keyof typeof TIMELINE_FILTER_LABELS;

export const TIMELINE_EVENT_CATEGORIES: Record<Exclude<TimelineFilterCategory, "all">, TimelineEventType[]> = {
  interactions: ["interaction_created", "interaction_updated"],
  tasks: ["task_created", "task_completed", "task_reopened", "task_updated", "task_deleted"],
  relationships: ["relationship_created"],
  organizations: ["organization_created", "organization_linked", "organization_unlinked"]
};
