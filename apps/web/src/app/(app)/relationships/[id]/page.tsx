import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteRelationshipButton } from "@/components/relationships/delete-relationship-button";
import { SafeBackLink } from "@/components/navigation/safe-back-link";
import { RelationshipForm } from "@/components/relationships/relationship-form";
import { ContextProjects } from "@/components/projects/context-projects";
import { TaskCard } from "@/components/tasks/task-card";
import { TimelineFilters, normalizeTimelineCategory } from "@/components/timeline/timeline-filters";
import { TimelineList } from "@/components/timeline/timeline-list";
import {
  RELATIONSHIP_PIPELINE_STAGE_LABELS,
  RELATIONSHIP_STATUS_LABELS,
  RELATIONSHIP_TYPE_LABELS
} from "@/features/relationships/options";
import { canDeleteRelationships } from "@/features/relationships/search";
import { getRelationshipDetail, listRelationshipOrganizationOptions, listRelationshipPeopleOptions } from "@/repositories/relationships";
import { listContextProjects } from "@/repositories/projects";
import { listRelationshipTasks } from "@/repositories/tasks";
import { getTenantContext } from "@/repositories/tenant-context";
import { listTimelineEvents } from "@/repositories/timeline-events";

type RelationshipDetailPageProps = {
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

function safeRelationshipReturnTo(value: string) {
  if (!value) return "/relationships";
  try {
    const parsed = new URL(value, "http://atlas.local");
    if (parsed.origin !== "http://atlas.local" || parsed.pathname !== "/pipeline") return "/relationships";
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return "/relationships";
  }
}

export default async function RelationshipDetailPage({ params, searchParams }: RelationshipDetailPageProps) {
  const { id } = await params;
  const query = await searchParams;
  const context = await getTenantContext();
  if (!context) notFound();

  const detail = await getRelationshipDetail(context, id);
  if (!detail) notFound();

  const { relationship, person, organization } = detail;
  const returnTo = safeRelationshipReturnTo(valueOf(query, "returnTo"));
  const relationshipReturnPath = returnTo === "/relationships"
    ? `/relationships/${relationship.id}`
    : `/relationships/${relationship.id}?returnTo=${encodeURIComponent(returnTo)}`;
  const timelineCategory = normalizeTimelineCategory(valueOf(query, "timelineCategory"));
  const timelinePage = Number(valueOf(query, "timelinePage") || 1);
  const [peopleOptions, organizationOptions, chronology, tasks, projects] = await Promise.all([
    listRelationshipPeopleOptions(context),
    listRelationshipOrganizationOptions(context),
    listTimelineEvents(context, { relationshipId: relationship.id, category: timelineCategory, page: timelinePage, pageSize: 3 }),
    listRelationshipTasks(context, relationship.id),
    listContextProjects(context, { relationshipId: relationship.id })
  ]);
  const visibleTasks = tasks.tasks.slice(0, 2);
  const timelineExpanded = Boolean(valueOf(query, "timelineCategory") || valueOf(query, "timelinePage"));

  return (
    <div className="page stack">
      <header className="page-header">
        <div>
          <p className="muted">Relations</p>
          <h1>{person?.display_name ?? "Relation"} - {organization?.name ?? "Organisation"}</h1>
        </div>
        <SafeBackLink fallbackHref={returnTo} useHistory={false} />
      </header>
      {valueOf(query, "relationshipCreated") === "1" ? <p className="success" aria-live="polite">Relation créée avec succès.</p> : null}
      {valueOf(query, "relationshipSaved") === "1" ? <p className="success" aria-live="polite">Relation enregistrée avec succès.</p> : null}

      <div className="grid">
        <section className="card stack">
          <h2>Identité</h2>
          <p><strong>Personne</strong><br />{person ? <Link href={`/people/${person.id}?returnTo=${encodeURIComponent(relationshipReturnPath)}`}>{person.display_name}</Link> : "-"}</p>
          <p><strong>Organisation</strong><br />{organization ? <Link href={`/organizations/${organization.id}`}>{organization.name}</Link> : "-"}</p>
          <p><strong>Type</strong><br />{RELATIONSHIP_TYPE_LABELS[relationship.relationship_type]}</p>
          <p><strong>Statut</strong><br />{RELATIONSHIP_STATUS_LABELS[relationship.status]}</p>
        </section>
        <section className="card stack">
          <h2>Pipeline</h2>
          <p><strong>Phase</strong><br />{RELATIONSHIP_PIPELINE_STAGE_LABELS[relationship.pipeline_stage]}</p>
          <p><strong>Score</strong><br />{relationship.score ?? "-"}</p>
          <p><strong>Confiance</strong><br />{relationship.confidence ?? "-"}</p>
          <p><strong>Responsable</strong><br />{relationship.owner_user_id ? "Assigné" : "Utilisateur non identifié"}</p>
        </section>
        <section className="card stack">
          <h2>Suivi</h2>
          <p><strong>Prochaine action</strong><br />{formatDate(relationship.next_action_at)}</p>
          <p><strong>Dernier échange</strong><br />{formatDate(relationship.last_interaction_at)}</p>
          <p><strong>Début</strong><br />{formatDate(relationship.started_at)}</p>
        </section>
      </div>

      <details className="card stack">
        <summary><strong>Informations complémentaires</strong> — notes, tags et dates</summary>
        <div className="grid">
          <section className="stack">
            <h2>Notes et tags</h2>
            <p><strong>Notes</strong><br />{relationship.notes ?? "Aucune note."}</p>
            <p><strong>Tags</strong><br />{relationship.tags.length > 0 ? relationship.tags.join(", ") : "Aucun tag."}</p>
          </section>
          <section className="stack">
            <h2>Dates complémentaires</h2>
            <p><strong>Fin</strong><br />{formatDate(relationship.ended_at)}</p>
            <p><strong>Créé le</strong><br />{formatDate(relationship.created_at)}</p>
            <p><strong>Modifié le</strong><br />{formatDate(relationship.updated_at)}</p>
          </section>
        </div>
      </details>

      <details className="card stack">
        <summary><strong>Projets liés</strong> — {countLabel(projects.projects.length, "projet", "projets")}</summary>
        <ContextProjects result={projects} newHref={`/projects/new?relationshipId=${relationship.id}`} allHref={`/projects?relationshipId=${relationship.id}`} />
      </details>

      <details className="card stack" open={timelineExpanded}>
        <summary><strong>Chronologie</strong> — {countLabel(chronology.total, "événement", "événements")}</summary>
        <div className="page-header">
          <h2>Chronologie</h2>
          <TimelineFilters category={timelineCategory} hiddenFields={{}} />
        </div>
        <TimelineList result={chronology} basePath={`/relationships/${relationship.id}`} category={timelineCategory} />
      </details>

      <details className="card stack">
        <summary><strong>Tâches liées</strong> — {countLabel(tasks.total, "tâche", "tâches")}</summary>
        <div className="page-header">
          <h2>Tâches liées</h2>
          <Link className="button subtle-button" href={`/tasks/new?sourceType=relationship&sourceId=${relationship.id}&relationshipId=${relationship.id}`}>Nouvelle tâche</Link>
        </div>
        {visibleTasks.length === 0 ? <p className="muted">Aucune tâche liée.</p> : visibleTasks.map((task) => <TaskCard key={task.id} task={task} />)}
        {tasks.tasks.length > visibleTasks.length ? <Link className="button subtle-button" href={`/tasks?relationshipId=${relationship.id}`}>Voir toutes les tâches</Link> : null}
      </details>

      <details className="card stack">
        <summary><strong>Modifier la relation</strong></summary>
        <RelationshipForm mode="edit" relationship={relationship} peopleOptions={peopleOptions} organizationOptions={organizationOptions} />
      </details>

      {canDeleteRelationships(context.role) ? (
        <details className="card stack danger-zone">
          <summary><strong>Suppression</strong></summary>
          <p>Réservée aux rôles owner et admin.</p>
          <DeleteRelationshipButton relationshipId={relationship.id} />
        </details>
      ) : null}
    </div>
  );
}
