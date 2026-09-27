import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { contactHistoryStatuses, listBrevoContactHistory } from "@/repositories/brevo-contact-history";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";
const reasons: Record<string, string> = {
  invalid_identity: "Identité à vérifier", tenant_mismatch: "Compte incompatible", missing_configuration: "Configuration incomplète",
  invalid_email: "Adresse email invalide", invalid_contact: "Contact Brevo à vérifier", identity_conflict: "Identité en conflit",
  email_change_requires_review: "Changement d’email à vérifier", contact_not_allowed: "Contact non autorisé",
  already_linked: "Contact déjà associé", already_blocklisted: "Envois déjà bloqués", email_collision: "Adresse déjà utilisée dans Brevo",
  source_changed: "Fiche modifiée pendant l’opération", source_or_lookup_failed: "Vérification indisponible",
  provider_rejected: "Opération refusée par Brevo", reconcile_before_retry: "Vérification requise avant toute nouvelle tentative",
  unclassified: "Motif à vérifier",
};
function date(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Date indisponible" : new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris",
  }).format(parsed);
}
function url(page: number, status: string) {
  return `/admin/brevo-contacts?${new URLSearchParams({ page: String(page), ...(status ? { status } : {}) })}`;
}

export default async function BrevoContactsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  const history = await listBrevoContactHistory({ page: first(params.page), status: first(params.status) });
  if (history.state === "forbidden") return <div className="page stack"><EmptyState title="Accès non autorisé" body="Le suivi Brevo est réservé aux propriétaires et administrateurs de votre espace." /></div>;

  return <div className={`page stack ${styles.page}`}>
    <PageHeader eyebrow={history.state === "ready" ? history.tenantName : "Administration"}
      title="Suivi des contacts Brevo" subtitle="Retrouvez les opérations enregistrées et les situations qui demandent une vérification."
      actions={<Link className="button subtle-button" href="/people">Voir les personnes</Link>} />
    <section className="card stack" aria-label="État de la synchronisation">
      <div><span className="status-badge subtle">Consultation uniquement</span></div>
      <h2>Synchronisation automatique non activée</h2>
      <p>Cette page consulte l’historique. Elle ne crée aucun contact et ne déclenche aucun email ou SMS.</p>
    </section>
    {history.state !== "ready" ? <section className="card stack" role="status">
      <h2>{history.state === "not_installed" ? "Historique pas encore disponible" : "Historique temporairement indisponible"}</h2>
      <p>{history.state === "not_installed" ? "Le suivi doit encore être installé sur cet environnement. Aucune opération ne peut être confirmée depuis cet écran pour le moment." : "Les opérations n’ont pas pu être chargées. Réessayez dans quelques instants."}</p>
      <div><Link className="button subtle-button" href="/admin/brevo-contacts">Actualiser le suivi</Link></div>
    </section> : <>
      <form className={`card ${styles.filters}`} method="get">
        <label htmlFor="brevo-status">État de l’opération
          <select key={history.status} id="brevo-status" name="status" defaultValue={history.status}>
            <option value="">Tous les états</option>
            {Object.entries(contactHistoryStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <button className="button" type="submit">Filtrer</button>
        <Link className="button subtle-button" href="/admin/brevo-contacts">Réinitialiser</Link>
      </form>
      <section className="stack" aria-labelledby="brevo-history-title">
        <h2 id="brevo-history-title">Historique · {history.total} opération{history.total === 1 ? "" : "s"}{history.status ? " dans cet état" : ""}</h2>
        <p className="muted">Une personne peut avoir plusieurs opérations. Les résultats décrivent leur état au moment de l’opération. Heures de Paris.</p>
        {history.rows.length === 0 ? <EmptyState title={history.total === 0 ? "Aucune opération enregistrée" : "Aucune opération sur cette page"} body="Aucune synchronisation ne peut être déduite de l’absence d’historique." /> :
          <ul className={styles.list}>{history.rows.map(row => <li key={row.id} className="card stack">
            <div className={styles.heading}><strong>{contactHistoryStatuses[row.status] ?? "État à vérifier"}</strong><time dateTime={row.created_at}>{date(row.created_at)}</time></div>
            <p>Personne <Link href={`/people/${encodeURIComponent(row.person_id)}`}>{row.person_id}</Link></p>
            {row.result_code ? <p>{reasons[row.result_code] ?? "Motif à vérifier"}</p> : null}
            {row.status === "pending" || row.status === "write_outcome_unknown" ? <p>Une vérification est nécessaire avant toute nouvelle tentative.</p> : null}
            {row.provider_contact_id ? <p>Identifiant Brevo : {row.provider_contact_id}</p> : null}
            {row.finished_at ? <p>Clôturée le {date(row.finished_at)}</p> : null}
          </li>)}</ul>}
        <nav className="actions" aria-label="Pages de l’historique Brevo">
          {history.page > 1 ? <Link className="button subtle-button" href={url(history.page - 1, history.status)}>Page précédente</Link> : null}
          <span>Page {history.page}</span>
          {history.page * 20 < history.total ? <Link className="button subtle-button" href={url(history.page + 1, history.status)}>Page suivante</Link> : null}
        </nav>
      </section>
    </>}
    <section className="card stack">
      <h2>Comment lire les résultats ?</h2>
      <p><strong>Contact créé :</strong> Brevo a confirmé la création. Cela ne confirme pas l’envoi d’un message.</p>
      <p><strong>Emails et SMS bloqués :</strong> le blocage des envois a été confirmé pour ce contact.</p>
      <p><strong>À vérifier :</strong> le résultat n’est pas confirmé. Aucune relance automatique n’est effectuée depuis ce suivi.</p>
    </section>
  </div>;
}
