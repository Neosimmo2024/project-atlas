import { ActionPlanPageClient } from "@/components/action-plan/action-plan-page-client";
import { EmptyState, PageHeader } from "@/components/ui";
import { listActionPlanOrganizations } from "@/repositories/action-plan";
import { getTenantContext } from "@/repositories/tenant-context";

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

  if (!context) {
    return (
      <div className="page stack">
        <PageHeader
          eyebrow="Plan d’action"
          title="Plan d’action"
          subtitle="Priorisez les recommandations calculées pour une organisation."
        />
        <EmptyState
          title="Aucun tenant actif"
          body="Connectez-vous avec un compte rattaché à un tenant pour consulter le Plan d’action."
        />
      </div>
    );
  }

  const organizations = await listActionPlanOrganizations(context);
  const organizationId = valueOf(params, "organizationId");

  return (
    <div className="page stack action-plan-page">
      <PageHeader
        eyebrow="Priorisation"
        title="Plan d’action"
        subtitle="Une vue consultative des recommandations calculées pour une organisation à la fois."
      />
      <ActionPlanPageClient organizations={organizations} initialOrganizationId={organizationId} />
    </div>
  );
}
