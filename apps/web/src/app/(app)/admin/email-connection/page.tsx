import { EmptyState } from "@/components/empty-state";
import { EmailConnectionCheck } from "@/components/email-connection-check";
import { PageHeader } from "@/components/ui/page-header";
import { getTenantContext } from "@/repositories/tenant-context";
import { ionosConnectionStatus } from "@/services/ionos-connection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function EmailConnectionPage() {
  const context = await getTenantContext();
  const status = context ? ionosConnectionStatus(context) : null;
  if (!status) return <div className="page stack"><EmptyState title="Connexion email non disponible" body="Cette connexion doit être configurée pour votre espace et est réservée à ses administrateurs." /></div>;
  return <div className="page stack">
    <PageHeader eyebrow="Les Formateurs Immo" title="Connexion email IONOS" subtitle={status.sender} />
    <p>Votre adresse contact sera utilisée pour les envois et les réponses.</p>
    <EmailConnectionCheck configured={status.configured} />
    <section className="card stack">
      <h2>Campagnes IONOS non activées</h2>
      <a href="/admin/lfi-campaign">Préparer la campagne Les Formateurs Immo</a>
      <p>La vérification de connexion est la première étape. Les envois, les désinscriptions et le traitement des réponses doivent être validés avant la mise en service.</p>
    </section>
  </div>;
}
