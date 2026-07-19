import { createTimelineEvent, type TimelineEventInput } from "@/repositories/timeline-events";
import { PROJECT_STAGE_LABELS } from "@/features/projects/options";
import { logServerError } from "@/lib/security/logger";
import type { Interaction, Organization, Person, Project, Relationship, Task, TenantContext, TimelineEventType } from "@/types/domain";

type TimelineSubject = {
  person_id?: string | null;
  organization_id?: string | null;
  relationship_id?: string | null;
  interaction_id?: string | null;
  task_id?: string | null;
  project_id?: string | null;
};

async function recordTimelineEvent(context: TenantContext, input: TimelineEventInput) {
  try {
    await createTimelineEvent(context, input);
  } catch (error) {
    logServerError("Timeline event recording failed", {
      tenantId: context.tenantId,
      eventType: input.event_type,
      sourceType: input.source_type,
      sourceId: input.source_id,
      error
    });
  }
}

function taskEventType(previous: Task | null, task: Task): TimelineEventType {
  if (!previous) return "task_created";
  if (previous.status !== "completed" && task.status === "completed") return "task_completed";
  if (previous.status === "completed" && task.status !== "completed") return "task_reopened";
  return "task_updated";
}

function taskSubject(task: Task): TimelineSubject {
  return {
    person_id: task.person_id,
    organization_id: task.organization_id,
    relationship_id: task.relationship_id,
    interaction_id: task.interaction_id,
    project_id: task.project_id,
    task_id: task.id
  };
}

function projectSubject(project: Project): TimelineSubject {
  return {
    person_id: project.person_id,
    organization_id: project.organization_id,
    relationship_id: project.relationship_id,
    project_id: project.id
  };
}

function moneyLabel(value: string | null, currency: string) {
  if (!value) return null;
  return `Valeur finale : ${new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(Number(value))}.`;
}

export async function recordPersonCreated(context: TenantContext, person: Person) {
  await recordTimelineEvent(context, {
    event_type: "person_created",
    title: person.display_name,
    description: person.source ? `Source: ${person.source}` : null,
    occurred_at: person.created_at,
    person_id: person.id,
    source_type: "person",
    source_id: person.id,
    idempotency_key: `person_created:${person.id}`
  });
}

export async function recordOrganizationCreated(context: TenantContext, organization: Organization) {
  await recordTimelineEvent(context, {
    event_type: "organization_created",
    title: organization.name,
    description: organization.source ? `Source: ${organization.source}` : null,
    occurred_at: organization.created_at,
    organization_id: organization.id,
    source_type: "organization",
    source_id: organization.id,
    idempotency_key: `organization_created:${organization.id}`
  });
}

export async function recordRelationshipCreated(context: TenantContext, relationship: Relationship) {
  const subject = {
    person_id: relationship.person_id,
    organization_id: relationship.organization_id,
    relationship_id: relationship.id
  };

  await Promise.all([
    recordTimelineEvent(context, {
      event_type: "relationship_created",
      title: `Relation ${relationship.relationship_type}`,
      description: relationship.notes,
      occurred_at: relationship.created_at,
      ...subject,
      source_type: "relationship",
      source_id: relationship.id,
      idempotency_key: `relationship_created:${relationship.id}`
    }),
    recordTimelineEvent(context, {
      event_type: "organization_linked",
      title: "Organisation liée",
      description: `Relation ${relationship.relationship_type}`,
      occurred_at: relationship.created_at,
      ...subject,
      source_type: "relationship",
      source_id: relationship.id,
      idempotency_key: `organization_linked:${relationship.id}`
    })
  ]);
}

export async function recordOrganizationUnlinked(context: TenantContext, relationship: Relationship) {
  await recordTimelineEvent(context, {
    event_type: "organization_unlinked",
    title: "Organisation dissociée",
    description: `Relation ${relationship.relationship_type}`,
    occurred_at: new Date().toISOString(),
    person_id: relationship.person_id,
    organization_id: relationship.organization_id,
    relationship_id: relationship.id,
    source_type: "relationship",
    source_id: relationship.id,
    idempotency_key: `organization_unlinked:${relationship.id}`
  });
}

export async function recordInteractionCreated(context: TenantContext, interaction: Interaction) {
  const subject = {
    person_id: interaction.person_id,
    organization_id: interaction.organization_id,
    relationship_id: interaction.relationship_id,
    project_id: interaction.project_id,
    interaction_id: interaction.id
  };

  await Promise.all([
    recordTimelineEvent(context, {
      event_type: "interaction_created",
      title: interaction.title,
      description: interaction.summary,
      occurred_at: interaction.interaction_date,
      ...subject,
      source_type: "interaction",
      source_id: interaction.id,
      idempotency_key: `interaction_created:${interaction.id}`
    }),
    interaction.project_id
      ? recordTimelineEvent(context, {
        event_type: "project_interaction_created",
        title: "Échange ajouté dans le Projet.",
        description: interaction.title,
        occurred_at: interaction.interaction_date,
        ...subject,
        source_type: "project",
        source_id: interaction.project_id,
        idempotency_key: `project_interaction_created:${interaction.project_id}:${interaction.id}`
      })
      : Promise.resolve()
  ]);
}

export async function recordInteractionUpdated(context: TenantContext, interaction: Interaction) {
  await recordTimelineEvent(context, {
    event_type: "interaction_updated",
    title: interaction.title,
    description: interaction.summary,
    occurred_at: interaction.updated_at,
    person_id: interaction.person_id,
    organization_id: interaction.organization_id,
    relationship_id: interaction.relationship_id,
    project_id: interaction.project_id,
    interaction_id: interaction.id,
    source_type: "interaction",
    source_id: interaction.id,
    idempotency_key: `interaction_updated:${interaction.id}:${interaction.updated_at}`
  });
}

export async function recordTaskChanged(context: TenantContext, task: Task, previous: Task | null = null) {
  const eventType = taskEventType(previous, task);
  await Promise.all([
    recordTimelineEvent(context, {
    event_type: eventType,
    title: task.title,
    description: task.description ?? task.reason,
    occurred_at: eventType === "task_completed" ? task.completed_at ?? task.updated_at : task.updated_at,
    ...taskSubject(task),
    source_type: "task",
    source_id: task.id,
    idempotency_key: `${eventType}:${task.id}:${eventType === "task_created" ? task.created_at : task.updated_at}`
    }),
    task.project_id && (eventType === "task_created" || eventType === "task_completed")
      ? recordTimelineEvent(context, {
        event_type: eventType === "task_created" ? "project_task_created" : "project_task_completed",
        title: eventType === "task_created" ? "Tâche créée dans le Projet." : "Tâche terminée dans le Projet.",
        description: task.title,
        occurred_at: eventType === "task_completed" ? task.completed_at ?? task.updated_at : task.created_at,
        ...taskSubject(task),
        source_type: "project",
        source_id: task.project_id,
        idempotency_key: `${eventType === "task_created" ? "project_task_created" : "project_task_completed"}:${task.project_id}:${task.id}:${eventType === "task_created" ? task.created_at : task.updated_at}`
      })
      : Promise.resolve()
  ]);
}

export async function recordTaskDeleted(context: TenantContext, task: Task) {
  await recordTimelineEvent(context, {
    event_type: "task_deleted",
    title: task.title,
    description: task.description ?? task.reason,
    occurred_at: new Date().toISOString(),
    ...taskSubject(task),
    source_type: "task",
    source_id: task.id,
    idempotency_key: `task_deleted:${task.id}`
  });
}

export async function recordProjectCreated(context: TenantContext, project: Project) {
  await recordTimelineEvent(context, {
    event_type: "project_created",
    title: "Projet créé.",
    description: project.title,
    occurred_at: project.created_at,
    ...projectSubject(project),
    source_type: "project",
    source_id: project.id,
    idempotency_key: `project_created:${project.id}`
  });
}

export async function recordProjectUpdated(context: TenantContext, project: Project, previous: Project) {
  const events: Promise<void>[] = [];

  if (previous.stage !== project.stage) {
    events.push(recordTimelineEvent(context, {
      event_type: "project_stage_changed",
      title: `Projet passé de ${PROJECT_STAGE_LABELS[previous.stage]} à ${PROJECT_STAGE_LABELS[project.stage]}.`,
      description: null,
      occurred_at: project.updated_at,
      ...projectSubject(project),
      source_type: "project",
      source_id: project.id,
      idempotency_key: `project_stage_changed:${project.id}:${project.updated_at}`
    }));
  }

  if (previous.owner_user_id !== project.owner_user_id) {
    events.push(recordTimelineEvent(context, {
      event_type: "project_owner_changed",
      title: "Responsable du Projet modifié.",
      description: null,
      occurred_at: project.updated_at,
      ...projectSubject(project),
      source_type: "project",
      source_id: project.id,
      idempotency_key: `project_owner_changed:${project.id}:${project.updated_at}`
    }));
  }

  if (previous.estimated_value !== project.estimated_value) {
    events.push(recordTimelineEvent(context, {
      event_type: "project_estimated_value_changed",
      title: "Valeur estimée du Projet modifiée.",
      description: project.estimated_value ? `Nouvelle valeur estimée : ${project.estimated_value} ${project.currency}.` : "Valeur estimée retirée.",
      occurred_at: project.updated_at,
      ...projectSubject(project),
      source_type: "project",
      source_id: project.id,
      idempotency_key: `project_estimated_value_changed:${project.id}:${project.updated_at}`
    }));
  }

  if (previous.expected_close_at !== project.expected_close_at) {
    events.push(recordTimelineEvent(context, {
      event_type: "project_expected_close_changed",
      title: "Date de clôture prévue modifiée.",
      description: project.expected_close_at,
      occurred_at: project.updated_at,
      ...projectSubject(project),
      source_type: "project",
      source_id: project.id,
      idempotency_key: `project_expected_close_changed:${project.id}:${project.updated_at}`
    }));
  }

  await Promise.all(events);
}

export async function recordProjectWon(context: TenantContext, project: Project) {
  await recordTimelineEvent(context, {
    event_type: "project_won",
    title: "Projet marqué comme gagné.",
    description: moneyLabel(project.final_value, project.currency) ?? project.closing_note,
    occurred_at: project.won_at ?? project.updated_at,
    ...projectSubject(project),
    source_type: "project",
    source_id: project.id,
    idempotency_key: `project_won:${project.id}:${project.won_at ?? project.updated_at}`
  });
}

export async function recordProjectLost(context: TenantContext, project: Project) {
  await recordTimelineEvent(context, {
    event_type: "project_lost",
    title: "Projet marqué comme perdu.",
    description: project.closing_note,
    occurred_at: project.lost_at ?? project.updated_at,
    ...projectSubject(project),
    source_type: "project",
    source_id: project.id,
    idempotency_key: `project_lost:${project.id}:${project.lost_at ?? project.updated_at}`
  });
}

export async function recordProjectReopened(context: TenantContext, project: Project) {
  await recordTimelineEvent(context, {
    event_type: "project_reopened",
    title: "Projet rouvert.",
    description: project.closing_note,
    occurred_at: project.updated_at,
    ...projectSubject(project),
    source_type: "project",
    source_id: project.id,
    idempotency_key: `project_reopened:${project.id}:${project.updated_at}`
  });
}

export async function recordProjectArchived(context: TenantContext, project: Project) {
  await recordTimelineEvent(context, {
    event_type: "project_archived",
    title: "Projet archivé.",
    description: project.closing_note,
    occurred_at: project.archived_at ?? project.updated_at,
    ...projectSubject(project),
    source_type: "project",
    source_id: project.id,
    idempotency_key: `project_archived:${project.id}:${project.archived_at ?? project.updated_at}`
  });
}

export async function recordProjectReactivated(context: TenantContext, project: Project) {
  await recordTimelineEvent(context, {
    event_type: "project_reactivated",
    title: "Projet réactivé.",
    description: null,
    occurred_at: project.updated_at,
    ...projectSubject(project),
    source_type: "project",
    source_id: project.id,
    idempotency_key: `project_reactivated:${project.id}:${project.updated_at}`
  });
}
