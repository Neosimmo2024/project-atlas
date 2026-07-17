import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteOrganizationButton } from "@/components/organizations/delete-organization-button";
import { OrganizationForm } from "@/components/organizations/organization-form";
import { TaskCard } from "@/components/tasks/task-card";
import { TimelineFilters, normalizeTimelineCategory } from "@/components/timeline/timeline-filters";
import { TimelineList } from "@/components/timeline/timeline-list";
import { ORGANIZATION_STATUS_LABELS, ORGANIZATION_TYPE_LABELS } from "@/features/organizations/options";
import { canDeleteOrganizations } from "@/features/organizations/search";
import { getOrganizationDetail, listParentOrganizationOptions } from "@/repositories/organizations";
import { listOrganizationTasks } from "@/repositories/tasks";
import { getTenantContext } from "@/repositories/tenant-context";
import { listTimelineEvents } from "@/repositories/timeline-events";

type OrganizationDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function valueOf(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function OrganizationDetailPage({ params, searchParams }: OrganizationDetailPageProps) {
  const { id } = await params;
  const query = await searchParams;
  const context = await getTenantContext();
  if (!context) notFound();

  const detail = await getOrganizationDetail(context, id);
  if (!detail) notFound();

  const { organization, parent, children, people, relationships } = detail;
  const timelineCategory = normalizeTimelineCategory(valueOf(query, "timelineCategory"));
  const timelinePage = Number(valueOf(query, "timelinePage") || 1);
  const [parentOptions, chronology, tasks] = await Promise.all([
    listParentOrganizationOptions(context, organization.id),
    listTimelineEvents(context, { organizationId: organization.id, category: timelineCategory, page: timelinePage, pageSize: 10 }),
    listOrganizationTasks(context, organization.id)
  ]);
  const typeLabel = organization.organization_type ? ORGANIZATION_TYPE_LABELS[organization.organization_type as keyof typeof ORGANIZATION_TYPE_LABELS] ?? organization.organization_type : "-";

  return (
    <div className="page stack">
      <header className="page-header">
        <div>
          <p className="muted">Organizations</p>
          <h1>{organization.name}</h1>
        </div>
        <Link className="button subtle-button" href="/organizations">Retour</Link>
      </header>

      <div className="grid">
        <section className="card stack">
          <h2>Identite</h2>
          <p><strong>Nom</strong><br />{organization.name}</p>
          <p><strong>Raison sociale</strong><br />{organization.legal_name ?? "-"}</p>
          <p><strong>Type</strong><br />{typeLabel}</p>
          <p><strong>Statut</strong><br />{ORGANIZATION_STATUS_LABELS[organization.status]}</p>
          <p><strong>Source</strong><br />{organization.source ?? "-"}</p>
        </section>
        <section className="card stack">
          <h2>Coordonnees</h2>
          <p><strong>Adresse</strong><br />{organization.address_line1 ?? "-"} {organization.address_line2 ?? ""}</p>
          <p><strong>Ville</strong><br />{organization.city ?? "-"} {organization.postal_code ? `(${organization.postal_code})` : ""}</p>
          <p><strong>Departement</strong><br />{organization.department ?? "-"}</p>
          <p><strong>Pays</strong><br />{organization.country ?? "-"}</p>
          <p><strong>Telephone</strong><br />{organization.primary_phone ?? "-"}</p>
          <p><strong>Email</strong><br />{organization.primary_email ?? "-"}</p>
          <p><strong>Site</strong><br />{organization.website_url ?? "-"}</p>
        </section>
        <section className="card stack">
          <h2>Informations legales</h2>
          <p><strong>SIREN</strong><br />{organization.siren ?? "-"}</p>
          <p><strong>SIRET</strong><br />{organization.siret ?? "-"}</p>
          <p><strong>TVA</strong><br />{organization.vat_number ?? "-"}</p>
          <p><strong>Contact autorise</strong><br />{organization.contact_allowed ? "Oui" : "Non"}</p>
          <p><strong>Ne pas contacter</strong><br />{organization.do_not_contact ? "Oui" : "Non"}</p>
        </section>
        <section className="card stack">
          <h2>Dates</h2>
          <p><strong>Cree le</strong><br />{formatDate(organization.created_at)}</p>
          <p><strong>Modifie le</strong><br />{formatDate(organization.updated_at)}</p>
        </section>
      </div>

      <section className="card stack">
        <h2>Commentaires</h2>
        <p>{organization.comments ?? "Aucun commentaire."}</p>
      </section>

      <section className="card stack">
        <h2>Hierarchie</h2>
        <p><strong>Organisation parente</strong><br />{parent ? <Link href={`/organizations/${parent.id}`}>{parent.name}</Link> : "Aucune"}</p>
        <div>
          <strong>Organisations filles</strong>
          {children.length === 0 ? <p className="muted">Aucune organisation fille.</p> : children.map((child) => <p key={child.id}><Link href={`/organizations/${child.id}`}>{child.name}</Link></p>)}
        </div>
      </section>

      <section className="card stack">
        <h2>Personnes liees</h2>
        {people.length === 0 ? <p className="muted">Aucune personne liee.</p> : people.map(({ person, relationship }) => (
          <p key={relationship.id}>
            <Link href={`/people/${person.id}`}>{person.display_name}</Link>
            {" - "}
            {person.job_title ?? relationship.relationship_type}
          </p>
        ))}
      </section>

      <section className="card stack">
        <h2>Relations liees</h2>
        {relationships.length === 0 ? <p className="muted">Aucune relation liee.</p> : relationships.map((relationship) => (
          <p key={relationship.id}>{relationship.relationship_type} - {relationship.pipeline_stage} - {relationship.status}</p>
        ))}
      </section>

      <section className="card stack">
        <div className="page-header">
          <h2>Chronologie</h2>
          <TimelineFilters category={timelineCategory} hiddenFields={{}} />
        </div>
        {valueOf(query, "interactionDeleted") === "1" ? <p className="success">Interaction supprimee.</p> : null}
        <TimelineList result={chronology} basePath={`/organizations/${organization.id}`} category={timelineCategory} />
      </section>

      <section className="card stack">
        <div className="page-header">
          <h2>Taches liees</h2>
          <Link className="button subtle-button" href={`/tasks/new?sourceType=organization&sourceId=${organization.id}&organizationId=${organization.id}`}>Nouvelle tache</Link>
        </div>
        {valueOf(query, "taskDeleted") === "1" ? <p className="success">Tache supprimee.</p> : null}
        {tasks.tasks.length === 0 ? <p className="muted">Aucune tache liee.</p> : tasks.tasks.map((task) => <TaskCard key={task.id} task={task} />)}
      </section>

      <section className="card stack">
        <h2>Modifier</h2>
        <OrganizationForm mode="edit" organization={organization} parentOptions={parentOptions} />
      </section>

      {canDeleteOrganizations(context.role) ? (
        <section className="card stack danger-zone">
          <h2>Suppression</h2>
          <p>Reservee aux roles owner et admin.</p>
          <DeleteOrganizationButton organizationId={organization.id} />
        </section>
      ) : null}
    </div>
  );
}
