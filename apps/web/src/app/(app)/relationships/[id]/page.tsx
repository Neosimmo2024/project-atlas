import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteRelationshipButton } from "@/components/relationships/delete-relationship-button";
import { RelationshipForm } from "@/components/relationships/relationship-form";
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

export default async function RelationshipDetailPage({ params, searchParams }: RelationshipDetailPageProps) {
  const { id } = await params;
  const query = await searchParams;
  const context = await getTenantContext();
  if (!context) notFound();

  const detail = await getRelationshipDetail(context, id);
  if (!detail) notFound();

  const { relationship, person, organization } = detail;
  const timelineCategory = normalizeTimelineCategory(valueOf(query, "timelineCategory"));
  const timelinePage = Number(valueOf(query, "timelinePage") || 1);
  const [peopleOptions, organizationOptions, chronology, tasks] = await Promise.all([
    listRelationshipPeopleOptions(context),
    listRelationshipOrganizationOptions(context),
    listTimelineEvents(context, { relationshipId: relationship.id, category: timelineCategory, page: timelinePage, pageSize: 10 }),
    listRelationshipTasks(context, relationship.id)
  ]);

  return (
    <div className="page stack">
      <header className="page-header">
        <div>
          <p className="muted">Relationships</p>
          <h1>{person?.display_name ?? "Relation"} - {organization?.name ?? "Organisation"}</h1>
        </div>
        <Link className="button subtle-button" href="/relationships">Retour</Link>
      </header>

      <div className="grid">
        <section className="card stack">
          <h2>Identite</h2>
          <p><strong>Personne</strong><br />{person ? <Link href={`/people/${person.id}`}>{person.display_name}</Link> : "-"}</p>
          <p><strong>Organisation</strong><br />{organization ? <Link href={`/organizations/${organization.id}`}>{organization.name}</Link> : "-"}</p>
          <p><strong>Type</strong><br />{RELATIONSHIP_TYPE_LABELS[relationship.relationship_type]}</p>
          <p><strong>Statut</strong><br />{RELATIONSHIP_STATUS_LABELS[relationship.status]}</p>
        </section>
        <section className="card stack">
          <h2>Pipeline</h2>
          <p><strong>Phase</strong><br />{RELATIONSHIP_PIPELINE_STAGE_LABELS[relationship.pipeline_stage]}</p>
          <p><strong>Score</strong><br />{relationship.score ?? "-"}</p>
          <p><strong>Confiance</strong><br />{relationship.confidence ?? "-"}</p>
          <p><strong>Responsable</strong><br />{relationship.owner_user_id ?? "-"}</p>
        </section>
        <section className="card stack">
          <h2>Dates</h2>
          <p><strong>Debut</strong><br />{formatDate(relationship.started_at)}</p>
          <p><strong>Fin</strong><br />{formatDate(relationship.ended_at)}</p>
          <p><strong>Prochaine action</strong><br />{formatDate(relationship.next_action_at)}</p>
          <p><strong>Derniere interaction</strong><br />{formatDate(relationship.last_interaction_at)}</p>
          <p><strong>Cree le</strong><br />{formatDate(relationship.created_at)}</p>
          <p><strong>Modifie le</strong><br />{formatDate(relationship.updated_at)}</p>
        </section>
        <section className="card stack">
          <h2>Tags</h2>
          <p>{relationship.tags.length > 0 ? relationship.tags.join(", ") : "Aucun tag."}</p>
        </section>
      </div>

      <section className="card stack">
        <h2>Notes</h2>
        <p>{relationship.notes ?? "Aucune note."}</p>
      </section>

      <section className="card stack">
        <h2>Metadata</h2>
        <pre className="code-block">{JSON.stringify(relationship.metadata ?? {}, null, 2)}</pre>
      </section>

      <section className="card stack">
        <div className="page-header">
          <h2>Chronologie</h2>
          <TimelineFilters category={timelineCategory} hiddenFields={{}} />
        </div>
        <TimelineList result={chronology} basePath={`/relationships/${relationship.id}`} category={timelineCategory} />
      </section>

      <section className="card stack">
        <div className="page-header">
          <h2>Taches liees</h2>
          <Link className="button subtle-button" href={`/tasks/new?sourceType=relationship&sourceId=${relationship.id}&relationshipId=${relationship.id}`}>Nouvelle tache</Link>
        </div>
        {tasks.tasks.length === 0 ? <p className="muted">Aucune tache liee.</p> : tasks.tasks.map((task) => <TaskCard key={task.id} task={task} />)}
      </section>

      <section className="card stack">
        <h2>Modifier</h2>
        <RelationshipForm mode="edit" relationship={relationship} peopleOptions={peopleOptions} organizationOptions={organizationOptions} />
      </section>

      {canDeleteRelationships(context.role) ? (
        <section className="card stack danger-zone">
          <h2>Suppression</h2>
          <p>Reservee aux roles owner et admin.</p>
          <DeleteRelationshipButton relationshipId={relationship.id} />
        </section>
      ) : null}
    </div>
  );
}
