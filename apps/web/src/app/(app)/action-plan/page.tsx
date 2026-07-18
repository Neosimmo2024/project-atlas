import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionPlanFilters } from "@/components/action-plan/action-plan-filters";
import { ActionPlanList } from "@/components/action-plan/action-plan-list";
import { getActionPlanForUser } from "@/repositories/action-plan";
import { getTenantContext } from "@/repositories/tenant-context";
import { listTaskOrganizationOptions } from "@/repositories/tasks";

type ActionPlanPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function valueOf(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function ActionPlanPage({ searchParams }: ActionPlanPageProps) {
  const params = await searchParams;
  const context = await getTenantContext();
  if (!context) notFound();

  const organizations = await listTaskOrganizationOptions(context);
  const requestedOrganizationId = valueOf(params, "organizationId");
  const selectedOrganization = organizations.find((organization) => organization.id === requestedOrganizationId) ?? organizations[0] ?? null;
  const items = selectedOrganization
    ? await getActionPlanForUser(context, { organizationId: selectedOrganization.id })
    : [];

  return (
    <div className="page stack">
      <header className="page-header">
        <div>
          <p className="muted">Action Plan</p>
          <h1>Plan d&apos;action</h1>
        </div>
        {selectedOrganization ? (
          <Link className="button subtle-button" href={`/organizations/${selectedOrganization.id}`}>Ouvrir l&apos;organisation</Link>
        ) : null}
      </header>

      <section className="card stack">
        <div className="page-header">
          <div>
            <h2>Organisation</h2>
            <p className="muted">Selectionnez le contexte metier a prioriser.</p>
          </div>
          {selectedOrganization ? <span className="action-plan-count">{items.length} action(s)</span> : null}
        </div>
        {organizations.length === 0 ? (
          <p className="muted">Aucune organisation disponible pour ce tenant.</p>
        ) : (
          <ActionPlanFilters organizations={organizations} selectedOrganizationId={selectedOrganization?.id ?? ""} />
        )}
      </section>

      <ActionPlanList items={items} />
    </div>
  );
}
