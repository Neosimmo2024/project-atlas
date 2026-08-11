import Link from "next/link";
import { notFound } from "next/navigation";
import { DeletePersonButton } from "@/components/people/delete-person-button";
import { SafeBackLink } from "@/components/navigation/safe-back-link";
import { PersonForm } from "@/components/people/person-form";
import { TalentQualificationForm } from "@/components/people/talent-qualification-form";
import { ContextProjects } from "@/components/projects/context-projects";
import { TaskCard } from "@/components/tasks/task-card";
import { TimelineFilters, normalizeTimelineCategory } from "@/components/timeline/timeline-filters";
import { TimelineList } from "@/components/timeline/timeline-list";
import { PERSON_STATUS_LABELS, PRIORITY_LABELS } from "@/features/people/options";
import { canDeletePeople } from "@/features/people/search";
import { getPersonDetail } from "@/repositories/people";
import { listContextProjects } from "@/repositories/projects";
import { listPersonTasks } from "@/repositories/tasks";
import { getTenantContext } from "@/repositories/tenant-context";
import { getTalentQualification } from "@/repositories/talent-qualifications";
import { QUALIFICATION_CONCLUSION_LABELS, QUALIFICATION_STATE_LABELS } from "@/features/talent-qualification/options";
import { listTimelineEvents } from "@/repositories/timeline-events";

type PersonDetailPageProps = {
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

export default async function PersonDetailPage({ params, searchParams }: PersonDetailPageProps) {
  const { id } = await params;
  const query = await searchParams;
  const context = await getTenantContext();
  if (!context) notFound();

  const detail = await getPersonDetail(context, id);
  if (!detail) notFound();

  const { person, organizations, relationships } = detail;
  const timelineCategory = normalizeTimelineCategory(valueOf(query, "timelineCategory"));
  const timelinePage = Number(valueOf(query, "timelinePage") || 1);
  const [chronology, tasks, projects, qualification] = await Promise.all([
    listTimelineEvents(context, { personId: person.id, category: timelineCategory, page: timelinePage, pageSize: 10 }),
    listPersonTasks(context, person.id),
    listContextProjects(context, { personId: person.id }),
    getTalentQualification(context, person.id)
  ]);

  return (
    <div className="page stack">
      <header className="page-header">
        <div>
          <p className="muted">Personnes</p>
          <h1>{person.display_name}</h1>
        </div>
        <SafeBackLink fallbackHref="/people" />
      </header>

      <div className="grid">
        <section className="card stack">
          <h2>Identité et coordonnées</h2>
          <p><strong>Prénom</strong><br />{person.first_name ?? "-"}</p>
          <p><strong>Nom</strong><br />{person.last_name ?? "-"}</p>
          <p><strong>Email</strong><br />{person.primary_email ?? "-"}</p>
          <p><strong>Téléphone</strong><br />{person.primary_phone ?? "-"}</p>
          <p><strong>Ville</strong><br />{person.city ?? "-"} {person.postal_code ? `(${person.postal_code})` : ""}</p>
          <p><strong>Département</strong><br />{person.department ?? "-"}</p>
          <p><strong>Fonction</strong><br />{person.job_title ?? "-"}</p>
        </section>
        <section className="card stack">
          <h2>Qualification</h2>
          <p><strong>Statut</strong><br />{PERSON_STATUS_LABELS[person.status]}</p>
          <p><strong>Priorité</strong><br />{PRIORITY_LABELS[person.priority]}</p>
          <p><strong>Score talent</strong><br />{person.talent_score == null ? "Non renseigné" : `${person.talent_score} / 10`}</p>
          <p><strong>Source</strong><br />{person.source ?? "-"}</p>
          <p><strong>Contact autorisé</strong><br />{person.contact_allowed ? "Oui" : "Non"}</p>
          <p><strong>Ne pas contacter</strong><br />{person.do_not_contact ? "Oui" : "Non"}</p>
        </section>
        <section className="card stack">
          <h2>Dates</h2>
          <p><strong>Créé le</strong><br />{formatDate(person.created_at)}</p>
          <p><strong>Dernière modification de la fiche</strong><br />{formatDate(person.updated_at)}</p>
        </section>
      </div>

      <section className="card stack qualification-summary">
        <div className="page-header">
          <div><p className="muted">Qualification structurée</p><h2>{QUALIFICATION_STATE_LABELS[qualification?.state ?? "none"]}</h2></div>
          {qualification?.conclusion ? <span className="status-pill">{QUALIFICATION_CONCLUSION_LABELS[qualification.conclusion]}</span> : null}
        </div>
        {qualification ? <div className="qualification-meta">
          <span>Dernière modification : {formatDate(qualification.updated_at)}</span>
          <span>Par : {qualification.updated_by_label}</span>
          {qualification.completed_at ? <span>Terminée le : {formatDate(qualification.completed_at)} par {qualification.completed_by_label}</span> : null}
        </div> : <p className="muted">Aucune qualification commencée.</p>}
        <TalentQualificationForm personId={person.id} qualification={qualification} canEdit={context.role !== "reader"} />
      </section>

      <section className="card stack">
        <h2>Commentaires</h2>
        <p>{person.comments ?? "Aucun commentaire."}</p>
      </section>

      <section className="card stack">
        <h2>Organisations liées</h2>
        {organizations.length === 0 ? <p className="muted">Aucune organisation liée.</p> : organizations.map((organization) => <p key={organization.id}>{organization.name}</p>)}
      </section>

      <section className="card stack">
        <h2>Relations de recrutement liées</h2>
        {relationships.length === 0 ? <p className="muted">Aucune relation liée.</p> : relationships.map((relationship) => (
          <p key={relationship.id}>{relationship.relationship_type} - {relationship.pipeline_stage} - {relationship.status}</p>
        ))}
      </section>

      <ContextProjects result={projects} newHref={`/projects/new?personId=${person.id}`} allHref={`/projects?personId=${person.id}`} />

      <section className="card stack">
        <div className="page-header">
          <h2>Chronologie</h2>
          <TimelineFilters category={timelineCategory} hiddenFields={{}} />
        </div>
        {valueOf(query, "interactionDeleted") === "1" ? <p className="success">Échange supprimé.</p> : null}
        <TimelineList result={chronology} basePath={`/people/${person.id}`} category={timelineCategory} />
      </section>

      <section className="card stack">
        <div className="page-header">
          <h2>Tâches liées</h2>
          <Link className="button subtle-button" href={`/tasks/new?sourceType=person&sourceId=${person.id}&personId=${person.id}`}>Nouvelle tâche</Link>
        </div>
        {valueOf(query, "taskDeleted") === "1" ? <p className="success">Tâche supprimée.</p> : null}
        {tasks.tasks.length === 0 ? <p className="muted">Aucune tâche liée.</p> : tasks.tasks.map((task) => <TaskCard key={task.id} task={task} />)}
      </section>

      <section className="card stack">
        <h2>Modifier</h2>
        <PersonForm mode="edit" person={person} />
      </section>

      {canDeletePeople(context.role) ? (
        <section className="card stack danger-zone">
          <h2>Suppression</h2>
          <p>Réservée aux rôles owner et admin.</p>
          <DeletePersonButton personId={person.id} />
        </section>
      ) : null}
    </div>
  );
}
