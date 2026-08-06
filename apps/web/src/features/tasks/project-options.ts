import type { TaskProjectOption, TaskRelationshipOption } from "@/repositories/tasks";

export function projectMatchesTaskContext(
  project: TaskProjectOption,
  relationshipsById: Map<string, TaskRelationshipOption>,
  context: { personId?: string | null; organizationId?: string | null; relationshipId?: string | null }
) {
  if (project.status !== "open" || project.archived_at) return false;
  const relationship = project.relationship_id ? relationshipsById.get(project.relationship_id) : null;
  return Boolean(
    (context.relationshipId && project.relationship_id === context.relationshipId) ||
    (context.personId && (project.person_id === context.personId || relationship?.person_id === context.personId)) ||
    (context.organizationId && (project.organization_id === context.organizationId || relationship?.organization_id === context.organizationId))
  );
}
