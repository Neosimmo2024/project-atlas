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
  organization_unlinked: "Organisation dissociée",
  project_created: "Projet créé",
  project_stage_changed: "Étape de Projet modifiée",
  project_owner_changed: "Responsable du Projet modifié",
  project_estimated_value_changed: "Valeur estimée modifiée",
  project_expected_close_changed: "Date de clôture prévue modifiée",
  project_won: "Projet gagné",
  project_lost: "Projet perdu",
  project_reopened: "Projet rouvert",
  project_archived: "Projet archivé",
  project_reactivated: "Projet réactivé",
  project_task_created: "Tâche créée dans le Projet",
  project_task_completed: "Tâche terminée dans le Projet",
  project_interaction_created: "Échange ajouté dans le Projet",
  relationship_stage_changed: "Phase de relation modifiée",
  relationship_signature_confirmed: "Signature confirmée",
  relationship_rejected: "Relation rejetée",
  relationship_reopened: "Relation rouverte",
  relationship_owner_changed: "Responsable de relation modifié",
  relationship_do_not_contact_changed: "Ne plus contacter modifié"
};

export const TIMELINE_FILTER_LABELS = {
  all: "Tous",
  interactions: "Échanges",
  tasks: "Tâches",
  relationships: "Relations",
  organizations: "Organisations",
  projects: "Projets"
} as const;

export type TimelineFilterCategory = keyof typeof TIMELINE_FILTER_LABELS;

export const TIMELINE_EVENT_CATEGORIES: Record<Exclude<TimelineFilterCategory, "all">, TimelineEventType[]> = {
  interactions: ["interaction_created", "interaction_updated", "project_interaction_created"],
  tasks: ["task_created", "task_completed", "task_reopened", "task_updated", "task_deleted", "project_task_created", "project_task_completed"],
  relationships: [
    "relationship_created",
    "relationship_stage_changed",
    "relationship_signature_confirmed",
    "relationship_rejected",
    "relationship_reopened",
    "relationship_owner_changed",
    "relationship_do_not_contact_changed"
  ],
  organizations: ["organization_created", "organization_linked", "organization_unlinked"],
  projects: [
    "project_created",
    "project_stage_changed",
    "project_owner_changed",
    "project_estimated_value_changed",
    "project_expected_close_changed",
    "project_won",
    "project_lost",
    "project_reopened",
    "project_archived",
    "project_reactivated"
  ]
};
