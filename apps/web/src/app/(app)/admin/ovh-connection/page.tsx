import { EmptyState } from "@/components/empty-state";
import { OvhConnectionCheck } from "@/components/ovh-connection-check";
import { PageHeader } from "@/components/ui/page-header";
import { getTenantContext } from "@/repositories/tenant-context";
import { ovhConnectionStatus } from "@/services/ovh-connection";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export default async function OvhConnectionPage() {
 const context = await getTenantContext(process.env.VSC_OVH_TENANT_ID?.trim());
 const status = context ? ovhConnectionStatus(context) : null;
 if (!status) return <div className="page stack"><EmptyState title="Connexion OVH non disponible" body="Cette connexion doit être configurée pour votre espace et est réservée à ses administrateurs." /></div>;
 return <div className="page stack">
  <PageHeader eyebrow="VendreSonCommerce" title="Connexion email OVH" subtitle={status.sender} />
  <p>Expéditeur : VendreSonCommerce — contact@vendresoncommerce.com. Les réponses doivent arriver sur cette même adresse.</p>
  <OvhConnectionCheck configured={status.configured} />
  <section className="card stack"><h2>Campagnes OVH non activées</h2><p>Le diagnostic vérifie la connexion SMTP. La réception et le traitement des réponses restent à valider avant la mise en service des campagnes.</p></section>
 </div>;
}
