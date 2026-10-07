import Link from "next/link";
import { notFound } from "next/navigation";
import { DeletePersonButton } from "@/components/people/delete-person-button";
import { SafeBackLink } from "@/components/navigation/safe-back-link";
import { PersonForm } from "@/components/people/person-form";
import { TalentQualificationForm } from "@/components/people/talent-qualification-form";
import { QualificationNotes } from "@/components/people/qualification-notes";
import { RecruitmentEmailSequenceCard } from "@/components/people/recruitment-email-sequence-card";
import { ContextProjects } from "@/components/projects/context-projects";
import { TaskCard } from "@/components/tasks/task-card";
import { TimelineFilters, normalizeTimelineCategory } from "@/components/timeline/timeline-filters";
import { TimelineList } from "@/components/timeline/timeline-list";
import { PERSON_STATUS_LABELS, PRIORITY_LABELS } from "@/features/people/options";
import { safePersonReturnTo } from "@/features/people/person-detail-return";
import { canDeletePeople } from "@/features/people/search";
import { getPersonDetail } from "@/repositories/people";
import { listContextProjects } from "@/repositories/projects";
import { listPersonTasks } from "@/repositories/tasks";
import { getTenantContext } from "@/repositories/tenant-context";
import { getTalentQualification } from "@/repositories/talent-qualifications";
import { getRecruitmentEmailSequence } from "@/repositories/recruitment-email-sequences";
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

function countLabel(count: number, singular: string, plural: string) {
  if (count === 0) return `Aucun ${singular}`;
  return `${count} ${count === 1 ? singular : plural}`;
}

export default async function PersonDetailPage({ params, searchParams }: PersonDetailPageProps) {
  const { id } = await params;
  const query = await searchParams;
  const context = await getTenantContext();
  if (!context) notFound();

  const detail = await getPersonDetail(context, id);
  if (!detail) notFound();

  const { person, organizations, relationships } = detail;
  const returnTo = safePersonReturnTo(valueOf(query, "returnTo"));
  const personReturnPath = returnTo === "/people"
    ? `/people/${person.id}`
    : `/people/${person.id}?returnTo=${encodeURIComponent(returnTo)}`;
  const timelineCategory = normalizeTimelineCategory(valueOf(query, "timelineCategory"));
  const timelinePage = Number(valueOf(query, "timelinePage") || 1);
  const [chronology, tasks, projects, qualification, recruitmentEmailSequence] = await Promise.all([
    listTimelineEvents(context, { personId: person.id, category: timelineCategory, page: timelinePage, pageSize: 3 }),
    listPersonTasks(context, person.id),
    listContextProjects(context, { personId: person.id }),
    getTalentQualification(context, person.id),
    getRecruitmentEmailSequence(context, person.id)
  ]);
  const visibleTasks = tasks.tasks.slice(0, 2);
  const lyonMarker = "[projet-lyon-neos-20261007]";
  const isLyonProfile = Boolean(person.comments?.includes(lyonMarker));
  const readableNotes = isLyonProfile && qualification?.comments
    ? `${person.comments?.split(lyonMarker)[0] ?? ""}${qualification.comments}`
    : person.comments;

  return (
    <div className="page stack">
      <header className="page-header">
        <div>
          <p className="muted">Personnes</p>
          <h1>{person.display_name}</h1>
        </div>
        <SafeBackLink fallbackHref={returnTo} useHistory={returnTo === "/people"}>
          {returnTo.startsWith("/projects/") ? "Retour au projet" : "Retour"}
        </SafeBackLink>
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

      {!isLyonProfile ? <RecruitmentEmailSequenceCard
        personId={person.id}
        email={person.primary_email}
        canContact={person.contact_allowed && !person.do_not_contact}
        canEdit={context.role !== "reader"}
        sequence={recruitmentEmailSequence}
      /> : null}

      <details className="card stack qualification-summary" open={isLyonProfile}>
        <summary>
          <strong>{isLyonProfile ? "Qualification Lyon" : "Qualification structurée"} — {QUALIFICATION_STATE_LABELS[qualification?.state ?? "none"]}</strong>
          {qualification?.conclusion ? ` — ${QUALIFICATION_CONCLUSION_LABELS[qualification.conclusion]}` : ""}
        </summary>
        {qualification ? <div className="qualification-meta">
          <span>Dernière modification : {formatDate(qualification.updated_at)}</span>
          <span>Par : {qualification.updated_by_label}</span>
          {qualification.completed_at ? <span>Terminée le : {formatDate(qualification.completed_at)} par {qualification.completed_by_label}</span> : null}
        </div> : <p className="muted">Aucune qualification commencée.</p>}
        {isLyonProfile ? <QualificationNotes comments={readableNotes} /> : qualification ? <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: "16px" }}>
          {Object.entries({ "Expérience": qualification.experience_level, "Statut professionnel": qualification.professional_status, "Ancienneté (années)": qualification.years_in_real_estate, "TVA": qualification.vat_situation, "Réseau": qualification.current_network, "Secteur": qualification.geographic_area, "Disponibilité": qualification.availability, "Projet": qualification.project_maturity, "Motivation": qualification.motivation, "Besoin principal": qualification.primary_need }).map(([label, value]) => <div key={label}><dt><strong>{label}</strong></dt><dd style={{ margin: "6px 0 0", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{value ?? "À confirmer"}</dd></div>)}
        </dl> : null}
        {!isLyonProfile && qualification?.comments ? <QualificationNotes comments={qualification.comments} /> : null}
        <details>
          <summary><strong>{context.role === "reader" ? "Voir les champs de qualification" : "Modifier la qualification"}</strong></summary>
          <TalentQualificationForm personId={person.id} qualification={qualification} canEdit={context.role !== "reader"} />
        </details>
      </details>

      {!isLyonProfile ? <details className="card stack">
        <summary><strong>Commentaires</strong> — {person.comments ? "Renseigné" : "Aucun"}</summary>
        <QualificationNotes comments={person.comments} />
      </details> : <details className="card stack">
        <summary><strong>Suivi des prises de contact</strong></summary>
        <p className="muted">Campagne Lyon : chaque invitation ou message doit être validé par Renato avant envoi.</p>
        <RecruitmentEmailSequenceCard personId={person.id} email={person.primary_email} canContact={person.contact_allowed && !person.do_not_contact} canEdit={context.role !== "reader"} sequence={recruitmentEmailSequence} />
      </details>}

      <details className="card stack">
        <summary><strong>Organisations liées</strong> — {countLabel(organizations.length, "organisation", "organisations")}</summary>
        {organizations.length === 0 ? <p className="muted">Aucune organisation liée.</p> : organizations.map((organization) => <p key={organization.id}>{organization.name}</p>)}
      </details>

      <details className="card stack">
        <summary><strong>Relations de recrutement liées</strong> — {countLabel(relationships.length, "relation", "relations")}</summary>
        {relationships.length === 0 ? <p className="muted">Aucune relation liée.</p> : relationships.map((relationship) => (
          <p key={relationship.id}>
            <Link href={`/relationships/${relationship.id}?returnTo=${encodeURIComponent(personReturnPath)}`}>
              {relationship.relationship_type} - {relationship.pipeline_stage} - {relationship.status}
            </Link>
          </p>
        ))}
      </details>

      <details className="card stack">
        <summary><strong>Projets liés</strong> — ouvrir pour consulter</summary>
        <ContextProjects result={projects} newHref={`/projects/new?personId=${person.id}&returnTo=${encodeURIComponent(personReturnPath)}`} allHref={`/projects?personId=${person.id}`} />
      </details>

      <details className="card stack">
        <summary><strong>Chronologie</strong> — 3 derniers événements</summary>
        <div className="page-header">
          <h2>Chronologie</h2>
          <div className="actions">
            <TimelineFilters category={timelineCategory} hiddenFields={{}} />
            <Link className="button subtle-button" href={`/interactions/new?personId=${person.id}&returnTo=${encodeURIComponent(personReturnPath)}`}>Nouvel échange</Link>
          </div>
        </div>
        {valueOf(query, "interactionDeleted") === "1" ? <p className="success">Échange supprimé.</p> : null}
        <TimelineList result={chronology} basePath={`/people/${person.id}`} category={timelineCategory} />
      </details>

      <details className="card stack">
        <summary><strong>Tâches liées</strong> — {tasks.total === 0 ? "Aucune tâche" : `${tasks.total} tâche${tasks.total > 1 ? "s" : ""}`}</summary>
        <div className="page-header">
          <h2>Tâches liées</h2>
          <Link className="button subtle-button" href={`/tasks/new?sourceType=person&sourceId=${person.id}&personId=${person.id}&returnTo=${encodeURIComponent(personReturnPath)}`}>Nouvelle tâche</Link>
        </div>
        {valueOf(query, "taskDeleted") === "1" ? <p className="success">Tâche supprimée.</p> : null}
        {visibleTasks.length === 0 ? <p className="muted">Aucune tâche liée.</p> : visibleTasks.map((task) => <TaskCard key={task.id} task={task} />)}
        {tasks.total > visibleTasks.length ? <Link className="button subtle-button" href={`/tasks?personId=${person.id}`}>Voir toutes les tâches</Link> : null}
      </details>

      <details className="card stack">
        <summary><strong>Modifier la fiche</strong></summary>
        <PersonForm mode="edit" person={person} />
      </details>

      {canDeletePeople(context.role) ? (
        <details className="card stack danger-zone">
          <summary><strong>Suppression</strong></summary>
          <p>Réservée aux rôles owner et admin.</p>
          <DeletePersonButton personId={person.id} />
        </details>
      ) : null}
    </div>
  );
}
