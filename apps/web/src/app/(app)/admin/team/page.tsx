import { EmptyState } from "@/components/empty-state";
import { TenantTeamAdmin } from "@/components/tenant-admin/tenant-team-admin";
import { PageHeader } from "@/components/ui/page-header";
import { canAccessTenantAdministration } from "@/features/tenant-admin/tenant-admin";
import { listTenantMembers } from "@/repositories/tenant-admin";
import { getTenantContext } from "@/repositories/tenant-context";

export default async function TenantTeamAdminPage() {
  const context = await getTenantContext();

  if (!context) {
    return (
      <div className="page stack">
        <EmptyState title="Aucun tenant actif" body="Connectez-vous avec un compte rattaché à un tenant pour administrer l’équipe." />
      </div>
    );
  }

  if (!canAccessTenantAdministration(context.role)) {
    return (
      <div className="page stack">
        <EmptyState title="Accès non autorisé" body="L’administration de l’équipe est réservée aux propriétaires et administrateurs." />
      </div>
    );
  }

  const members = await listTenantMembers(context);

  return (
    <div className="page stack tenant-admin-page">
      <PageHeader
        eyebrow={context.tenant.name}
        title="Administration de l’équipe"
        subtitle="Consultez les membres déjà rattachés au tenant actif et gérez leurs rôles ou leur statut."
      />
      <TenantTeamAdmin tenantName={context.tenant.name} actorRole={context.role} initialMembers={members} />
    </div>
  );
}
