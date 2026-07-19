import Link from "next/link";
import { TaskForm } from "@/components/tasks/task-form";
import {
  listTaskInteractionOptions,
  listTaskOrganizationOptions,
  listTaskPeopleOptions,
  listTaskProjectOptions,
  listTaskRelationshipOptions
} from "@/repositories/tasks";
import { getTenantContext } from "@/repositories/tenant-context";
import type { TaskSourceType } from "@/types/domain";

type NewTaskPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function valueOf(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function sourceType(params: Record<string, string | string[] | undefined>): TaskSourceType {
  const value = valueOf(params, "sourceType");
  if (value === "person" || value === "organization" || value === "relationship" || value === "interaction" || value === "project") return value;
  return "manual";
}

export default async function NewTaskPage({ searchParams }: NewTaskPageProps) {
  const params = await searchParams;
  const context = await getTenantContext();
  const [peopleOptions, organizationOptions, relationshipOptions, interactionOptions, projectOptions] = context
    ? await Promise.all([
      listTaskPeopleOptions(context),
      listTaskOrganizationOptions(context),
      listTaskRelationshipOptions(context),
      listTaskInteractionOptions(context),
      listTaskProjectOptions(context)
    ])
    : [[], [], [], [], []];

  const defaults = {
    person_id: valueOf(params, "personId") || null,
    organization_id: valueOf(params, "organizationId") || null,
    relationship_id: valueOf(params, "relationshipId") || null,
    interaction_id: valueOf(params, "interactionId") || null,
    project_id: valueOf(params, "projectId") || null,
    source_type: sourceType(params),
    source_id: valueOf(params, "sourceId") || null
  };

  return (
    <div className="page stack">
      <header className="page-header">
        <div>
          <p className="muted">Smart Tasks</p>
          <h1>Nouvelle tache</h1>
        </div>
        <Link className="button subtle-button" href="/tasks">Retour</Link>
      </header>
      <section className="card stack">
        <TaskForm
          mode="create"
          defaults={defaults}
          peopleOptions={peopleOptions}
          organizationOptions={organizationOptions}
          relationshipOptions={relationshipOptions}
          interactionOptions={interactionOptions}
          projectOptions={projectOptions}
        />
      </section>
    </div>
  );
}
