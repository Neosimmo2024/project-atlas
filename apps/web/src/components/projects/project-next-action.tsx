import Link from "next/link";
import { TaskStatusButton } from "@/components/tasks/task-status-button";
import { formatDateTime } from "./project-utils";
import type { ProjectDetail } from "@/repositories/projects";
import type { TaskListItem } from "@/repositories/tasks";

const reasonLabels = {
  overdue: "en retard",
  today: "aujourd'hui",
  next_due: "prochaine echeance",
  priority_without_due: "priorite sans echeance"
} as const;

export function ProjectNextAction({ detail, task }: { detail: ProjectDetail; task?: TaskListItem }) {
  const action = detail.nextAction;
  const project = detail.project;
  const newTaskHref = `/tasks/new?sourceType=project&sourceId=${project.id}&projectId=${project.id}&personId=${project.person_id ?? ""}&organizationId=${project.organization_id ?? ""}&relationshipId=${project.relationship_id ?? ""}`;

  return (
    <section className="card stack">
      <h2>Prochaine action</h2>
      {action ? (
        <>
          <p><strong>{action.title}</strong><br />Echeance : {formatDateTime(action.dueAt)} - Priorite : {action.priority} - Motif : {reasonLabels[action.reason]}</p>
          <div className="actions">
            <Link className="button subtle-button" href={`/tasks/${action.taskId}`}>Ouvrir la tache</Link>
            {task ? <TaskStatusButton task={task} nextStatus="completed">Terminer</TaskStatusButton> : null}
            <Link className="button subtle-button" href={`/tasks/${action.taskId}`}>Reporter</Link>
          </div>
        </>
      ) : (
        <>
          <p className="muted">Aucune prochaine action n est planifiee.</p>
          <Link className="button link-button" href={newTaskHref}>Creer une tache</Link>
        </>
      )}
    </section>
  );
}
