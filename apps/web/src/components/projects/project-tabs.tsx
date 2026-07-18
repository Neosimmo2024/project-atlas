import Link from "next/link";
import { InteractionCard } from "@/components/interactions/interaction-card";
import { TaskCard } from "@/components/tasks/task-card";
import { TimelineFilters, normalizeTimelineCategory } from "@/components/timeline/timeline-filters";
import { TimelineList } from "@/components/timeline/timeline-list";
import { formatDate, formatMoney, projectStageLabel, projectStatusLabel, projectTypeLabel } from "./project-utils";
import { EntityTabs } from "@/components/ui";
import type { InteractionsListResult } from "@/repositories/interactions";
import type { ProjectDetail } from "@/repositories/projects";
import type { TasksListResult } from "@/repositories/tasks";
import type { TimelineListResult } from "@/repositories/timeline-events";

type ProjectTabsProps = {
  detail: ProjectDetail;
  tasks: TasksListResult;
  interactions: InteractionsListResult;
  chronology: TimelineListResult;
  tab: string;
  timelineCategory: string;
};

function tabHref(projectId: string, tab: string) {
  return `/projects/${projectId}?tab=${tab}`;
}

export function ProjectTabs({ detail, tasks, interactions, chronology, tab, timelineCategory }: ProjectTabsProps) {
  const current = ["overview", "tasks", "interactions", "history"].includes(tab) ? tab : "overview";
  const project = detail.project;
  const newTaskHref = `/tasks/new?sourceType=project&sourceId=${project.id}&projectId=${project.id}&personId=${project.person_id ?? ""}&organizationId=${project.organization_id ?? ""}&relationshipId=${project.relationship_id ?? ""}`;
  const newInteractionHref = `/interactions/new?projectId=${project.id}&personId=${project.person_id ?? ""}&organizationId=${project.organization_id ?? ""}&relationshipId=${project.relationship_id ?? ""}`;

  return (
    <section className="card stack">
      <EntityTabs label="Onglets Projet">
        <Link className={current === "overview" ? "active" : ""} href={tabHref(project.id, "overview")}>Vue ensemble</Link>
        <Link className={current === "tasks" ? "active" : ""} href={tabHref(project.id, "tasks")}>Taches</Link>
        <Link className={current === "interactions" ? "active" : ""} href={tabHref(project.id, "interactions")}>Echanges</Link>
        <Link className={current === "history" ? "active" : ""} href={tabHref(project.id, "history")}>Historique</Link>
      </EntityTabs>

      {current === "overview" ? (
        <div className="stack">
          <div className="grid">
            <section className="stack">
              <h2>Informations du Projet</h2>
              <p><strong>Type</strong><br />{projectTypeLabel(project.project_type)}</p>
              <p><strong>Statut</strong><br />{projectStatusLabel(project.status)}</p>
              <p><strong>Etape</strong><br />{projectStageLabel(project.stage)}</p>
              <p><strong>Valeur estimee</strong><br />{formatMoney(project.estimated_value, project.currency)}</p>
              <p><strong>Date de cloture</strong><br />{formatDate(project.expected_close_at)}</p>
            </section>
            <section className="stack">
              <h2>Contacts</h2>
              <p><strong>Personne</strong><br />{detail.person ? <Link href={`/people/${detail.person.id}`}>{detail.person.display_name}</Link> : "-"}</p>
              <p><strong>Organisation</strong><br />{detail.organization ? <Link href={`/organizations/${detail.organization.id}`}>{detail.organization.name}</Link> : "-"}</p>
              <p><strong>Relation</strong><br />{detail.relationship ? <Link href={`/relationships/${detail.relationship.id}`}>{detail.relationship.relationship_type} - {detail.relationship.pipeline_stage}</Link> : "-"}</p>
            </section>
          </div>
          <section className="stack">
            <h2>Trois dernieres taches</h2>
            {tasks.tasks.slice(0, 3).length === 0 ? <p className="muted">Aucune tache liee.</p> : tasks.tasks.slice(0, 3).map((task) => <TaskCard key={task.id} task={task} />)}
          </section>
          <section className="stack">
            <h2>Trois derniers echanges</h2>
            {interactions.interactions.slice(0, 3).length === 0 ? <p className="muted">Aucun echange lie.</p> : interactions.interactions.slice(0, 3).map((interaction) => <InteractionCard key={interaction.id} interaction={interaction} />)}
          </section>
        </div>
      ) : null}

      {current === "tasks" ? (
        <div className="stack">
          <div className="actions"><Link className="button link-button" href={newTaskHref}>Creer une tache</Link></div>
          {tasks.tasks.length === 0 ? <p className="muted">Aucune tache liee.</p> : tasks.tasks.map((task) => <TaskCard key={task.id} task={task} />)}
        </div>
      ) : null}

      {current === "interactions" ? (
        <div className="stack">
          <div className="actions"><Link className="button link-button" href={newInteractionHref}>Ajouter un echange</Link></div>
          {interactions.interactions.length === 0 ? <p className="muted">Aucun echange lie.</p> : interactions.interactions.map((interaction) => <InteractionCard key={interaction.id} interaction={interaction} />)}
        </div>
      ) : null}

      {current === "history" ? (
        <div className="stack">
          <div className="page-header">
            <h2>Historique</h2>
            <TimelineFilters category={normalizeTimelineCategory(timelineCategory)} hiddenFields={{}} />
          </div>
          <TimelineList result={chronology} basePath={`/projects/${project.id}`} category={timelineCategory} />
        </div>
      ) : null}
    </section>
  );
}
