import { createTimelineEvent, type TimelineEventInput } from "@/repositories/timeline-events";
import type { Interaction, Organization, Person, Relationship, Task, TenantContext, TimelineEventType } from "@/types/domain";

type TimelineSubject = {
  person_id?: string | null;
  organization_id?: string | null;
  relationship_id?: string | null;
  interaction_id?: string | null;
  task_id?: string | null;
};

async function recordTimelineEvent(context: TenantContext, input: TimelineEventInput) {
  try {
    await createTimelineEvent(context, input);
  } catch (error) {
    console.error("Timeline event recording failed", {
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
    task_id: task.id
  };
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
  await recordTimelineEvent(context, {
    event_type: "interaction_created",
    title: interaction.title,
    description: interaction.summary,
    occurred_at: interaction.interaction_date,
    person_id: interaction.person_id,
    organization_id: interaction.organization_id,
    relationship_id: interaction.relationship_id,
    interaction_id: interaction.id,
    source_type: "interaction",
    source_id: interaction.id,
    idempotency_key: `interaction_created:${interaction.id}`
  });
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
    interaction_id: interaction.id,
    source_type: "interaction",
    source_id: interaction.id,
    idempotency_key: `interaction_updated:${interaction.id}:${interaction.updated_at}`
  });
}

export async function recordTaskChanged(context: TenantContext, task: Task, previous: Task | null = null) {
  const eventType = taskEventType(previous, task);
  await recordTimelineEvent(context, {
    event_type: eventType,
    title: task.title,
    description: task.description ?? task.reason,
    occurred_at: eventType === "task_completed" ? task.completed_at ?? task.updated_at : task.updated_at,
    ...taskSubject(task),
    source_type: "task",
    source_id: task.id,
    idempotency_key: `${eventType}:${task.id}:${eventType === "task_created" ? task.created_at : task.updated_at}`
  });
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
