import Link from "next/link";
import { InteractionForm } from "@/components/interactions/interaction-form";
import { listInteractionOrganizationOptions, listInteractionPeopleOptions, listInteractionProjectOptions, listInteractionRelationshipOptions, listInteractionTypes } from "@/repositories/interactions";
import { getTenantContext } from "@/repositories/tenant-context";

type NewInteractionPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function valueOf(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function NewInteractionPage({ searchParams }: NewInteractionPageProps) {
  const params = await searchParams;
  const context = await getTenantContext();
  const [types, peopleOptions, organizationOptions, relationshipOptions, projectOptions] = context
    ? await Promise.all([
      listInteractionTypes(context),
      listInteractionPeopleOptions(context),
      listInteractionOrganizationOptions(context),
      listInteractionRelationshipOptions(context),
      listInteractionProjectOptions(context)
    ])
    : [[], [], [], [], []];

  const defaults = {
    person_id: valueOf(params, "personId") || null,
    organization_id: valueOf(params, "organizationId") || null,
    relationship_id: valueOf(params, "relationshipId") || null,
    project_id: valueOf(params, "projectId") || null,
    interaction_date: new Date().toISOString()
  };

  return (
    <div className="page stack">
      <header className="page-header">
        <div>
          <p className="muted">Interactions</p>
          <h1>Nouvelle interaction</h1>
        </div>
        <Link className="button subtle-button" href="/interactions">Retour</Link>
      </header>
      <section className="card">
        <InteractionForm mode="create" types={types} peopleOptions={peopleOptions} organizationOptions={organizationOptions} relationshipOptions={relationshipOptions} projectOptions={projectOptions} defaults={defaults} />
      </section>
    </div>
  );
}
