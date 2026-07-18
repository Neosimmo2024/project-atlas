import Link from "next/link";
import { ProjectForm } from "@/components/projects/project-form";
import {
  listProjectOrganizationOptions,
  listProjectOwnerOptions,
  listProjectPeopleOptions,
  listProjectRelationshipOptions
} from "@/repositories/projects";
import { getTenantContext } from "@/repositories/tenant-context";

type NewProjectPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function valueOf(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function NewProjectPage({ searchParams }: NewProjectPageProps) {
  const params = await searchParams;
  const context = await getTenantContext();
  const [peopleOptions, organizationOptions, relationshipOptions, ownerOptions] = context
    ? await Promise.all([
      listProjectPeopleOptions(context),
      listProjectOrganizationOptions(context),
      listProjectRelationshipOptions(context),
      listProjectOwnerOptions(context)
    ])
    : [[], [], [], []];

  const defaults = {
    person_id: valueOf(params, "personId") || null,
    organization_id: valueOf(params, "organizationId") || null,
    relationship_id: valueOf(params, "relationshipId") || null
  };

  return (
    <div className="page stack">
      <header className="page-header">
        <div>
          <p className="muted">Projets</p>
          <h1>Nouveau Projet</h1>
        </div>
        <Link className="button subtle-button" href="/projects">Retour</Link>
      </header>
      <section className="card stack">
        <ProjectForm
          mode="create"
          defaults={defaults}
          peopleOptions={peopleOptions}
          organizationOptions={organizationOptions}
          relationshipOptions={relationshipOptions}
          ownerOptions={ownerOptions}
          currentUserId={context?.userId ?? ""}
        />
      </section>
    </div>
  );
}
