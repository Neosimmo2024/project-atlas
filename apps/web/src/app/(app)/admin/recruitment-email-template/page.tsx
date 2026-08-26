import { EmptyState } from "@/components/empty-state";
import { RecruitmentEmailTemplateManager } from "@/components/recruitment-email-template/template-manager";
import { PageHeader } from "@/components/ui/page-header";
import { listRecruitmentEmailTemplateVersions } from "@/repositories/recruitment-email-template-versions";
import { getTenantContext } from "@/repositories/tenant-context";

export default async function RecruitmentEmailTemplateAdminPage() {
  const context = await getTenantContext();

  if (!context) {
    return <div className="page stack"><EmptyState title="Aucun tenant actif" body="Connectez-vous pour administrer le modèle Brevo." /></div>;
  }
  if (context.role !== "owner" && context.role !== "admin") {
    return <div className="page stack"><EmptyState title="Accès non autorisé" body="La gestion du modèle Brevo est réservée aux propriétaires et administrateurs." /></div>;
  }

  const versions = await listRecruitmentEmailTemplateVersions(context);

  return (
    <div className="page stack template-admin-page">
      <PageHeader
        eyebrow={context.tenant.name}
        title="Modèle du premier email"
        subtitle="Modifiez, prévisualisez, versionnez et synchronisez le modèle Brevo sans envoyer d’email."
      />
      <RecruitmentEmailTemplateManager initialVersions={versions} />
    </div>
  );
}
