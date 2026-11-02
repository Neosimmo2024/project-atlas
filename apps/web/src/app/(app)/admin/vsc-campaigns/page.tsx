import { VscLastDayDraft } from '@/components/vsc-last-day-draft';
import { VscHistoricalInboundSync } from '@/components/vsc-historical-inbound-sync';
import Link from "next/link";
import { VscSmsAudience } from "@/components/vsc-sms-audience";
import { VscBrevoSmsStops } from "@/components/vsc-brevo-sms-stops";
import { VscHistoricalFollowup } from "@/components/vsc-historical-followup";
import { VscHistoricalReplies } from "@/components/vsc-historical-replies";
import { VscBrevoHistory } from "@/components/vsc-brevo-history";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { VscDraftWorkspace } from "@/components/vsc-draft-workspace";
import { VscDispatchReview } from "@/components/vsc-dispatch-review";
import { VscSmsPreview } from "@/components/vsc-sms-preview";
import { VscBrevoSmsStatus } from "@/components/vsc-brevo-sms-status";
import { VscSmsDraftContacts } from "@/components/vsc-sms-draft-contacts";
import { VscBrevoContactImport } from "@/components/vsc-brevo-contact-import";
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
    <PageHeader eyebrow="VendreSonCommerce" title="Préparer les campagnes" subtitle="Brouillons email et SMS à relire avant toute activation" />
    <p>79 € HT au lieu de 159 € HT, annonce jusqu’à la vente. Promotion jusqu’au 30 novembre 2026.</p>
    <p>Les dates sont proposées pour relecture. Aucun email ni SMS n’est envoyé ou programmé chez un prestataire.</p>
    <section className="card stack" aria-label="Blocages avant lancement">
      <h2>Avant tout lancement : points à terminer</h2>
      <ul>
        <li><strong>Approbation manuelle :</strong> les campagnes enregistrées restent en brouillon. Cette page ne permet ni approbation ni activation.</li>
        <li><strong>Déclenchement email :</strong> l’adaptateur OVH est désactivé par défaut et n’est appelé par aucune route ou planification. Il n’existe pas encore de bouton d’envoi manuel.</li>
        <li><strong>Validation de campagne :</strong> relire et valider ensemble les textes, les destinataires et la cadence du pilote avant de changer l’état d’une campagne.</li>
        <li><strong>Cas incertains :</strong> prévoir une vérification humaine auditée avant toute décision de renvoi ; aucun renvoi automatique n’est prévu.</li>
        <li><strong>SMS et surveillance :</strong> le transport SMS VSC et les planifications de collecte restent séparés et non activés.</li>
      </ul>
      <p>Ce parcours ne déclenche aucun envoi commercial automatique et n’installe aucun calendrier d’envoi. Les brouillons et leurs dates sont conservés pour relecture.</p>
    </section>
    <Link href="/admin/ovh-connection">Connexion OVH et suivi des réponses</Link>
    <VscBrevoContactImport />
    <VscBrevoHistory />
    <VscHistoricalReplies />
    <VscHistoricalInboundSync />
    <VscHistoricalFollowup />
    <VscLastDayDraft />
    <VscDraftWorkspace today={vscDraftToday()} />
    <VscDispatchReview tenantId={context.tenantId} />
    <VscSmsPreview today={vscDraftToday()} />
    <VscSmsDraftContacts tenantId={context.tenantId} />
    <VscBrevoSmsStatus />
    <VscBrevoSmsStops />
    <VscSmsAudience />
  </div>;
}
