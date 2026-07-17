import Link from "next/link";
import { TaskFilters } from "@/components/tasks/task-filters";
import { TaskList } from "@/components/tasks/task-list";
import { listTasks } from "@/repositories/tasks";
import { getTenantContext } from "@/repositories/tenant-context";

type TasksPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function valueOf(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function TasksPage({ searchParams }: TasksPageProps) {
  const params = await searchParams;
  const context = await getTenantContext();
  const query = valueOf(params, "query");
  const status = valueOf(params, "status");
  const priority = valueOf(params, "priority");
  const due = valueOf(params, "due");
  const page = Number(valueOf(params, "page") || 1);
  const currentParams = new URLSearchParams();
  if (query) currentParams.set("query", query);
  if (status) currentParams.set("status", status);
  if (priority) currentParams.set("priority", priority);
  if (due) currentParams.set("due", due);

  const result = context
    ? await listTasks(context, { query, status, priority, due, page, pageSize: 10 })
    : { tasks: [], total: 0, page: 1, pageSize: 10, pageCount: 1 };

  return (
    <div className="page stack">
      <header className="page-header">
        <div>
          <p className="muted">Smart Tasks</p>
          <h1>Taches</h1>
        </div>
        <Link className="button link-button" href="/tasks/new">Nouvelle tache</Link>
      </header>

      {valueOf(params, "taskDeleted") === "1" ? <p className="success">Tache supprimee.</p> : null}
      <TaskFilters query={query} status={status} priority={priority} due={due} />
      <TaskList result={result} currentParams={currentParams} />
    </div>
  );
}
