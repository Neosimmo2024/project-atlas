import Link from "next/link";
import { formatDate, formatDateTime, formatMoney, projectSignals, projectStageLabel, projectStatusLabel, projectTypeLabel } from "./project-utils";
import type { ProjectListItem } from "@/repositories/projects";

function nextActionLabel(project: ProjectListItem) {
  if (!project.nextAction) return "Aucune action planifiee";
  const reason = {
    overdue: "en retard",
    today: "aujourd'hui",
    next_due: "prochaine echeance",
    priority_without_due: "priorite sans echeance"
  }[project.nextAction.reason];
  return `${project.nextAction.title} - ${reason}`;
}

export function ProjectCard({ project }: { project: ProjectListItem }) {
  const signals = projectSignals(project, Boolean(project.nextAction), project.nextAction?.reason);

  return (
    <Link className="card project-card stack" href={`/projects/${project.id}`}>
      <div>
        <p className="muted">{projectTypeLabel(project.project_type)} - {projectStatusLabel(project.status)}</p>
        <h2>{project.title}</h2>
      </div>
      <div className="interaction-meta">
        <span>Etape : {projectStageLabel(project.stage)}</span>
        <span>Personne : {project.person?.display_name ?? "-"}</span>
        <span>Organisation : {project.organization?.name ?? "-"}</span>
      </div>
      <div className="interaction-meta">
        <span>Responsable : {project.owner_user_id}</span>
        <span>Valeur estimee : {formatMoney(project.estimated_value, project.currency)}</span>
        <span>Cloture prevue : {formatDate(project.expected_close_at)}</span>
      </div>
      <p><strong>Prochaine action</strong><br />{nextActionLabel(project)}</p>
      <p className="muted">Derniere activite : {formatDateTime(project.lastActivityAt)}</p>
      {signals.length > 0 ? <div className="tag-list">{signals.map((signal) => <span className="tag" key={signal}>{signal}</span>)}</div> : null}
    </Link>
  );
}
