import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectActions } from "@/components/projects/project-actions";
import { ProjectForm } from "@/components/projects/project-form";
import { ProjectNextAction } from "@/components/projects/project-next-action";
import { ProjectTabs } from "@/components/projects/project-tabs";
import { formatDate, projectSignals, projectStageLabel, projectStatusLabel, projectTypeLabel } from "@/components/projects/project-utils";
import { EntityHeader, EntitySummary, PageSection } from "@/components/ui";
import {
  getProjectDetail,
  listProjectOrganizationOptions,
  listProjectOwnerOptions,
  listProjectPeopleOptions,
  listProjectRelationshipOptions
} from "@/repositories/projects";
import { listProjectInteractions } from "@/repositories/interactions";
import { listProjectTasks } from "@/repositories/tasks";
import { getTenantContext } from "@/repositories/tenant-context";
import { listTimelineEvents } from "@/repositories/timeline-events";

type ProjectDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function valueOf(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function ProjectDetailPage({ params, searchParams }: ProjectDetailPageProps) {
  const { id } = await params;
  const query = await searchParams;
  const context = await getTenantContext();
  if (!context) notFound();

  const detail = await getProjectDetail(context, id);
  if (!detail) notFound();

  const tab = valueOf(query, "tab") || "overview";
  const timelineCategory = valueOf(query, "timelineCategory") || "all";
  const timelinePage = Number(valueOf(query, "timelinePage") || 1);
  const [tasks, interactions, chronology, peopleOptions, organizationOptions, relationshipOptions, ownerOptions] = await Promise.all([
    listProjectTasks(context, id),
    listProjectInteractions(context, id),
    listTimelineEvents(context, { projectId: id, category: timelineCategory, page: timelinePage, pageSize: 10 }),
    listProjectPeopleOptions(context),
    listProjectOrganizationOptions(context),
    listProjectRelationshipOptions(context),
    listProjectOwnerOptions(context)
  ]);
  const project = detail.project;
  const nextTask = detail.nextAction ? tasks.tasks.find((task) => task.id === detail.nextAction?.taskId) : undefined;
  const signals = projectSignals(project, Boolean(detail.nextAction), detail.nextAction?.reason);

  return (
    <div className="page stack">
      <EntityHeader eyebrow="Projet" title={project.title} meta={`${projectTypeLabel(project.project_type)} - ${projectStatusLabel(project.status)} - ${projectStageLabel(project.stage)}`} actions={<Link className="button subtle-button" href="/projects">Retour</Link>} />

      {valueOf(query, "toast") ? <p className="success" aria-live="polite">{valueOf(query, "toast")}</p> : null}
      {valueOf(query, "projectSaved") === "1" ? <p className="success" aria-live="polite">Projet cree.</p> : null}
      {signals.length > 0 ? <div className="tag-list">{signals.map((signal) => <span className="tag" key={signal}>{signal}</span>)}</div> : null}

      <PageSection>
        <EntitySummary>
          <p><strong>Responsable</strong><br />{project.owner_user_id}</p>
          <p><strong>Personne</strong><br />{detail.person ? <Link href={`/people/${detail.person.id}`}>{detail.person.display_name}</Link> : "-"}</p>
          <p><strong>Organisation</strong><br />{detail.organization ? <Link href={`/organizations/${detail.organization.id}`}>{detail.organization.name}</Link> : "-"}</p>
          <p><strong>Cloture prevue</strong><br />{formatDate(project.expected_close_at)}</p>
        </EntitySummary>
        <ProjectActions project={project} />
      </PageSection>

      <ProjectNextAction detail={detail} task={nextTask} />
      <ProjectTabs detail={detail} tasks={tasks} interactions={interactions} chronology={chronology} tab={tab} timelineCategory={timelineCategory} />

      <PageSection title="Modifier">
        <ProjectForm
          mode="edit"
          project={project}
          peopleOptions={peopleOptions}
          organizationOptions={organizationOptions}
          relationshipOptions={relationshipOptions}
          ownerOptions={ownerOptions}
          currentUserId={context.userId}
        />
      </PageSection>
    </div>
  );
}
