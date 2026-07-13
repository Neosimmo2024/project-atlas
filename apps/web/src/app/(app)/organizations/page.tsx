import { EmptyState } from "@/components/empty-state";
import { listOrganizations } from "@/repositories/organizations";
import { getTenantContext } from "@/repositories/tenant-context";

export default async function OrganizationsPage() {
  const context = await getTenantContext();
  const organizations = context ? await listOrganizations(context) : [];
  return (
    <div className="page stack">
      <header><p className="muted">Companies and networks</p><h1>Organizations</h1></header>
      {organizations.length === 0 ? <EmptyState title="Aucune organisation" body="Les entreprises, agences et reseaux seront listes ici." /> : (
        <div className="table">{organizations.map((organization) => <article key={organization.id} className="row"><strong>{organization.name}</strong><span>{organization.organization_type ?? "Type non renseigne"}</span><span>{organization.city ?? "Ville non renseignee"}</span></article>)}</div>
      )}
    </div>
  );
}
