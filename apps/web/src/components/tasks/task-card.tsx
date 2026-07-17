import Link from "next/link";
import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from "@/features/tasks/options";
import type { TaskListItem } from "@/repositories/tasks";

function formatDate(value: string | null) {
  if (!value) return "Aucune echeance";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function isOverdue(task: TaskListItem) {
  return Boolean(task.due_at && task.status !== "completed" && task.status !== "cancelled" && new Date(task.due_at) < new Date());
}

export function TaskCard({ task }: { task: TaskListItem }) {
  return (
    <Link className={`card task-card stack ${isOverdue(task) ? "task-overdue" : ""}`} href={`/tasks/${task.id}`}>
      <div>
        <p className="muted">{TASK_STATUS_LABELS[task.status]} - {TASK_PRIORITY_LABELS[task.priority]}</p>
        <h2>{task.title}</h2>
      </div>
      <p>{task.description ?? task.reason ?? "Aucune description."}</p>
      <div className="interaction-meta">
        <span>{formatDate(task.due_at)}</span>
        <span>{task.person?.display_name ?? task.organization?.name ?? task.relationship?.relationship_type ?? task.interaction?.title ?? "Contexte manuel"}</span>
      </div>
    </Link>
  );
}
