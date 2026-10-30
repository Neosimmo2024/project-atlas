import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { OvhConnectionCheck } from "@/components/ovh-connection-check";
import { VscReplySelfTest } from "@/components/vsc-reply-self-test";
import { canRunVscReplySelfTest, getVscReplySelfTestId } from "@/services/vsc-reply-self-test";
import { VscReplyPreview } from "@/components/vsc-reply-preview";
import { VscCampaignSummary } from "@/components/vsc-campaign-summary";
import { PageHeader } from "@/components/ui/page-header";
import { getTenantContext } from "@/repositories/tenant-context";
import { ovhConnectionStatus } from "@/services/ovh-connection";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export default async function OvhConnectionPage() {
  const context = await getTenantContext(process.env.VSC_OVH_TENANT_ID?.trim());
  const status = context ? ovhConnectionStatus(context) : null;
  if (!context || !status) return <div className="page stack"><EmptyState title="Connexion OVH non disponible" body="Cette connexion doit être configurée pour votre espace et est réservée à ses administrateurs." /></div>;
  const testEnabled = canRunVscReplySelfTest(context);
  const selfTestId = testEnabled ? await getVscReplySelfTestId(context) : undefined;
  return <div className="page stack">
    <PageHeader eyebrow="VendreSonCommerce" title="Connexion email OVH" subtitle={status.sender} />
    <p>Expéditeur : VendreSonCommerce — contact@vendresoncommerce.com. Les réponses doivent arriver sur cette même adresse.</p>
    <OvhConnectionCheck configured={status.configured} />
    {testEnabled ? <VscReplySelfTest initialTestId={selfTestId} /> : null}
    <VscReplyPreview />
    <VscCampaignSummary />
    <Link href="/admin/vsc-campaigns">Préparer et consulter les brouillons email VSC</Link>
    <section className="card stack"><h2>Campagnes OVH non activées</h2><p>Les contrôles techniques sont séparés de la mise en service. Aucune campagne commerciale ne sera activée avant validation.</p></section>
  </div>;
}
