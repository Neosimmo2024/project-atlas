import { LyonEmailPreparation } from "@/components/projects/lyon-email-preparation";
import { lyonCampaignSchema } from "@/features/recruitment-email/lyon-campaign";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectActions } from "@/components/projects/project-actions";
import { QualificationNotes } from "@/components/people/qualification-notes";
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
import { listProjectProfiles } from "@/repositories/project-profiles";

type ProjectDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function valueOf(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function safeReturnTo(value: string) {
  return value.startsWith("/relationships/") || value.startsWith("/organizations/") || value.startsWith("/people/") ? value : "/projects";
}

export default async function ProjectDetailPage({ params, searchParams }: ProjectDetailPageProps) {
  const { id } = await params;
  const query = await searchParams;
  const context = await getTenantContext();
  if (!context) notFound();

  const detail = await getProjectDetail(context, id);
  if (!detail) notFound();

  const returnTo = safeReturnTo(valueOf(query, "returnTo"));
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
  const lyonCampaign = lyonCampaignSchema.safeParse(project.metadata.recruitment_email_campaign);
  const profiles = await listProjectProfiles(context, project);
  const personReturnQuery = `?returnTo=${encodeURIComponent(`/projects/${project.id}`)}`;
  const nextTask = detail.nextAction ? tasks.tasks.find((task) => task.id === detail.nextAction?.taskId) : undefined;
  const signals = projectSignals(project, Boolean(detail.nextAction), detail.nextAction?.reason);
  const ownerLabel = ownerOptions.find((owner) => owner.id === project.owner_user_id)?.name ?? "Utilisateur non identifié";

  return (
    <div className="page stack">
      <EntityHeader eyebrow="Projet" title={project.title} meta={`${projectTypeLabel(project.project_type)} - ${projectStatusLabel(project.status)} - ${projectStageLabel(project.stage)}`} actions={<Link className="button subtle-button" href={returnTo}>Retour</Link>} />

      {valueOf(query, "toast") ? <p className="success" aria-live="polite">{valueOf(query, "toast")}</p> : null}
      {valueOf(query, "projectSaved") === "1" ? <p className="success" aria-live="polite">Projet enregistré.</p> : null}
      {signals.length > 0 ? <div className="tag-list">{signals.map((signal) => <span className="tag" key={signal}>{signal}</span>)}</div> : null}

      {project.metadata.lyon_development ? <LyonEmailPreparation projectId={id} campaign={lyonCampaign.success ? lyonCampaign.data : null} canPrepare={context.role === "owner" || context.role === "admin"} /> : null}

      {profiles.length > 0 ? <PageSection title={`Profils à étudier (${profiles.length})`}>
        <p>Ouvrez une fiche pour consulter sa qualification et compléter vos notes. Vous pouvez aussi créer une tâche liée à cette personne et à ce projet.</p>
        {project.metadata.lyon_development ? <p>Les contrôles LinkedIn sont consignés dans le bilan du projet. Les profils incertains restent exclus de la liste email préparée. Aucun envoi n’est lancé.</p> : null}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th scope="col">Profil</th><th scope="col">Ville / fonction</th><th scope="col">Qualification</th><th scope="col">Actions</th></tr></thead>
            <tbody>{profiles.map((person, index) => {
              const marker = "[projet-lyon-neos-20261007]";
              const notes = project.metadata.lyon_development ? person.comments?.split(marker)[1]?.trim() : person.comments;
              return <tr key={person.id} style={{ verticalAlign: "top", borderTop: "1px solid #ddd" }}>
                <td style={{ padding: "12px 8px" }}><Link href={`/people/${person.id}${personReturnQuery}`}>{index + 1}. {person.display_name}</Link></td>
                <td style={{ padding: "12px 8px" }}>{person.city ?? "Ville à vérifier"}<br />{person.job_title ?? "Fonction à vérifier dans la qualification"}</td>
                <td style={{ padding: "12px 8px", minWidth: "280px" }}>{person.do_not_contact ? <strong>Ne pas contacter</strong> : null}{notes ? <details><summary>Lire les notes et les points à vérifier</summary><div style={{ maxWidth: "850px", paddingTop: "16px" }}><QualificationNotes comments={notes} /></div></details> : "Qualification à compléter"}</td>
                <td style={{ padding: "12px 8px" }}><Link href={`/people/${person.id}${personReturnQuery}`}>Ouvrir la fiche</Link><br /><Link href={`/tasks/new?sourceType=project&sourceId=${project.id}&projectId=${project.id}&personId=${person.id}`}>Créer une tâche</Link></td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      </PageSection> : null}

      <PageSection>
        <EntitySummary>
          <p><strong>Responsable</strong><br />{ownerLabel}</p>
          <p><strong>Personne</strong><br />{detail.person ? <Link href={`/people/${detail.person.id}${personReturnQuery}`}>{detail.person.display_name}</Link> : "-"}</p>
          <p><strong>Organisation</strong><br />{detail.organization ? <Link href={`/organizations/${detail.organization.id}`}>{detail.organization.name}</Link> : "-"}</p>
          <p><strong>Clôture prévue</strong><br />{formatDate(project.expected_close_at)}</p>
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
          returnTo={returnTo === "/projects" ? undefined : returnTo}
        />
      </PageSection>
    </div>
  );
}
