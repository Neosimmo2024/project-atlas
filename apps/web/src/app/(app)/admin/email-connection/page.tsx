import { EmptyState } from "@/components/empty-state";
import { EmailConnectionCheck } from "@/components/email-connection-check";
import { PageHeader } from "@/components/ui/page-header";
import { getTenantContext } from "@/repositories/tenant-context";
import { brevoSmtpStatus } from "@/services/brevo-smtp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function EmailConnectionPage() {
  const context = await getTenantContext();
  const status = context ? brevoSmtpStatus(context) : null;
  if (!status) return <div className="page stack"><EmptyState title="Connexion email non disponible" body="Cette connexion doit être configurée pour votre espace et est réservée à ses administrateurs." /></div>;
  return <div className="page stack">
    <PageHeader eyebrow="Les Formateurs Immo" title="Envoi email Brevo" subtitle={status.sender} />
    <p>Brevo envoie les emails depuis cette adresse. La réception des réponses et des avis de rebond reste gérée par la boîte IONOS.</p>
    <EmailConnectionCheck configured={status.configured} />
    <section className="card stack">
      <h2>Campagnes LFI en pause</h2>
      <a href="/admin/lfi-campaign">Préparer la campagne Les Formateurs Immo</a>
      <p>La connexion SMTP Brevo est utilisée pour les envois. Les réponses et rebonds sont toujours contrôlés dans la boîte IONOS. Les campagnes restent en pause et ne seront pas activées par ce contrôle.</p>
    </section>
  </div>;
}
