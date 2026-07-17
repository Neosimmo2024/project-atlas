import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { TaskCard } from "./task-card";
import type { TasksListResult } from "@/repositories/tasks";

type TaskListProps = {
  result: TasksListResult;
  currentParams: URLSearchParams;
};

function tasksUrl(params: URLSearchParams, page: number) {
  const next = new URLSearchParams(params);
  next.set("page", String(page));
  return `/tasks?${next.toString()}`;
}

export function TaskList({ result, currentParams }: TaskListProps) {
  return (
    <div className="stack">
      {result.tasks.length === 0 ? <EmptyState title="Aucune tache" body="Les prochaines actions liees aux personnes, organisations, relations et interactions seront listees ici." /> : (
        <div className="task-list">
          {result.tasks.map((task) => <TaskCard key={task.id} task={task} />)}
        </div>
      )}

      <nav className="pagination" aria-label="Pagination Tasks">
        <span>{result.total} resultat(s)</span>
        <div>
          {result.page > 1 ? <Link className="button subtle-button" href={tasksUrl(currentParams, result.page - 1)}>Precedent</Link> : null}
          <span>Page {result.page} / {result.pageCount}</span>
          {result.page < result.pageCount ? <Link className="button subtle-button" href={tasksUrl(currentParams, result.page + 1)}>Suivant</Link> : null}
        </div>
      </nav>
    </div>
  );
}
