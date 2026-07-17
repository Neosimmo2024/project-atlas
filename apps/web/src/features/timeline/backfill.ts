import type { Interaction, Organization, Person, Relationship, Task, TimelineEventType, TimelineSourceType } from "@/types/domain";

type BackfillSource = Person | Organization | Relationship | Interaction | Task;

export type BackfillTimelineEventInput = {
  tenant_id: string;
  event_type: TimelineEventType;
  title: string;
  description: string | null;
  occurred_at: string;
  created_by: string | null;
  person_id: string | null;
  organization_id: string | null;
  relationship_id: string | null;
  interaction_id: string | null;
  task_id: string | null;
  source_type: TimelineSourceType;
  source_id: string;
  metadata: Record<string, unknown>;
  visibility: "tenant";
  idempotency_key: string;
};

function baseEvent(source: BackfillSource, eventType: TimelineEventType, sourceType: TimelineSourceType): Omit<BackfillTimelineEventInput, "title" | "description" | "occurred_at"> {
  return {
    tenant_id: source.tenant_id,
    event_type: eventType,
    created_by: "created_by" in source ? source.created_by : null,
    person_id: null,
    organization_id: null,
    relationship_id: null,
    interaction_id: null,
    task_id: null,
    source_type: sourceType,
    source_id: source.id,
    metadata: { backfilled: true },
    visibility: "tenant",
    idempotency_key: `${eventType}:${source.id}`
  };
}

export function buildPersonBackfillEvent(person: Person): BackfillTimelineEventInput {
  return {
    ...baseEvent(person, "person_created", "person"),
    title: person.display_name,
    description: person.source ? `Source: ${person.source}` : null,
    occurred_at: person.created_at,
    person_id: person.id
  };
}

export function buildOrganizationBackfillEvent(organization: Organization): BackfillTimelineEventInput {
  return {
    ...baseEvent(organization, "organization_created", "organization"),
    title: organization.name,
    description: organization.source ? `Source: ${organization.source}` : null,
    occurred_at: organization.created_at,
    organization_id: organization.id
  };
}

export function buildRelationshipBackfillEvents(relationship: Relationship): BackfillTimelineEventInput[] {
  return [
    {
      ...baseEvent(relationship, "relationship_created", "relationship"),
      title: `Relation ${relationship.relationship_type}`,
      description: relationship.notes,
      occurred_at: relationship.created_at,
      person_id: relationship.person_id,
      organization_id: relationship.organization_id,
      relationship_id: relationship.id
    },
    {
      ...baseEvent(relationship, "organization_linked", "relationship"),
      title: "Organisation liee",
      description: `Relation ${relationship.relationship_type}`,
      occurred_at: relationship.created_at,
      person_id: relationship.person_id,
      organization_id: relationship.organization_id,
      relationship_id: relationship.id
    }
  ];
}

export function buildInteractionBackfillEvent(interaction: Interaction): BackfillTimelineEventInput {
  return {
    ...baseEvent(interaction, "interaction_created", "interaction"),
    title: interaction.title,
    description: interaction.summary,
    occurred_at: interaction.interaction_date,
    person_id: interaction.person_id,
    organization_id: interaction.organization_id,
    relationship_id: interaction.relationship_id,
    interaction_id: interaction.id
  };
}

export function buildTaskBackfillEvent(task: Task): BackfillTimelineEventInput {
  return {
    ...baseEvent(task, "task_created", "task"),
    title: task.title,
    description: task.description ?? task.reason,
    occurred_at: task.created_at,
    person_id: task.person_id,
    organization_id: task.organization_id,
    relationship_id: task.relationship_id,
    interaction_id: task.interaction_id,
    task_id: task.id
  };
}
