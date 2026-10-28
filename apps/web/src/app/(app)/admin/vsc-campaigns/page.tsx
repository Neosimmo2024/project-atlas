import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { VscDraftWorkspace } from "@/components/vsc-draft-workspace";
import { getTenantContext } from "@/repositories/tenant-context";
import { canManageOvh } from "@/services/ovh-connection";
import { vscDraftToday } from "@/services/vsc-draft-workspace";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export default async function VscCampaignsPage() {
  const tenantId = process.env.VSC_OVH_TENANT_ID?.trim();
  const context = tenantId ? await getTenantContext(tenantId) : null;
  if (!context || !canManageOvh(context)) return <div className="page stack"><EmptyState title="Préparation indisponible" body="Cette page est réservée aux administrateurs VendreSonCommerce." /></div>;
  return <div className="page stack">
    <PageHeader eyebrow="VendreSonCommerce" title="Préparer une campagne email" subtitle="Brouillons à relire avant toute activation" />
    <p>79 € HT au lieu de 159 € HT, annonce jusqu’à la vente. Promotion jusqu’au 30 novembre 2026.</p>
    <p>Les dates sont proposées pour relecture. Aucun email ni SMS n’est envoyé ou programmé chez un prestataire.</p>
    <Link href="/admin/ovh-connection">Connexion OVH et suivi des réponses</Link>
    <VscDraftWorkspace today={vscDraftToday()} />
  </div>;
}
