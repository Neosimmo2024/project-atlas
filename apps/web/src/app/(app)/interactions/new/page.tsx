import Link from "next/link";
import { InteractionForm } from "@/components/interactions/interaction-form";
import { listInteractionOrganizationOptions, listInteractionPeopleOptions, listInteractionRelationshipOptions, listInteractionTypes } from "@/repositories/interactions";
import { getTenantContext } from "@/repositories/tenant-context";

export default async function NewInteractionPage() {
  const context = await getTenantContext();
  const [types, peopleOptions, organizationOptions, relationshipOptions] = context
    ? await Promise.all([
      listInteractionTypes(context),
      listInteractionPeopleOptions(context),
      listInteractionOrganizationOptions(context),
      listInteractionRelationshipOptions(context)
    ])
    : [[], [], [], []];

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
        <InteractionForm mode="create" types={types} peopleOptions={peopleOptions} organizationOptions={organizationOptions} relationshipOptions={relationshipOptions} />
      </section>
    </div>
  );
}
