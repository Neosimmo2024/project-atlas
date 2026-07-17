import type { TimelineEventType } from "@/types/domain";

export const TIMELINE_EVENT_LABELS: Record<TimelineEventType, string> = {
  person_created: "Personne creee",
  organization_created: "Organisation creee",
  relationship_created: "Relation creee",
  interaction_created: "Echange cree",
  interaction_updated: "Echange modifie",
  task_created: "Tache creee",
  task_completed: "Tache terminee",
  task_reopened: "Tache rouverte",
  task_updated: "Tache modifiee",
  task_deleted: "Tache supprimee",
  organization_linked: "Organisation liee",
  organization_unlinked: "Organisation dissociee"
};

export const TIMELINE_FILTER_LABELS = {
  all: "Tous",
  interactions: "Echanges",
  tasks: "Taches",
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
