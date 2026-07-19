import type { RoleSlug, Task, TaskDueFilter } from "@/types/domain";
import { escapePostgrestLikePattern, quotePostgrestFilterValue } from "../people/search";

export type TasksSearchParams = {
  query?: string;
  status?: string;
  priority?: string;
  due?: string;
  personId?: string;
  organizationId?: string;
  relationshipId?: string;
  interactionId?: string;
  projectId?: string;
  page?: number;
  pageSize?: number;
};

export function normalizeSearchValue(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export function buildTasksSearchOrFilter(columns: string[], query: string) {
  const pattern = quotePostgrestFilterValue(`*${escapePostgrestLikePattern(query.trim())}*`);
  return columns.map((column) => `${column}.ilike.${pattern}`).join(",");
}

export function taskMatchesSearch(task: Pick<Task, "title" | "description" | "reason">, query: string) {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) return true;

  return [task.title, task.description, task.reason].some((value) => normalizeSearchValue(value).includes(normalizedQuery));
}

export function canDeleteTasks(role: RoleSlug) {
  return role === "owner" || role === "admin";
}

export function canWriteTasks(role: RoleSlug) {
  return role === "owner" || role === "admin" || role === "recruiter" || role === "manager";
}

export function normalizeTasksListParams(params: TasksSearchParams) {
  const pageSize = Math.min(Math.max(Number(params.pageSize) || 10, 1), 50);
  const page = Math.max(Number(params.page) || 1, 1);
  const due = params.due?.trim() as TaskDueFilter | "";

  return {
    query: params.query?.trim() || "",
    status: params.status?.trim() || "",
    priority: params.priority?.trim() || "",
    due: due || "",
    personId: params.personId?.trim() || "",
    organizationId: params.organizationId?.trim() || "",
    relationshipId: params.relationshipId?.trim() || "",
    interactionId: params.interactionId?.trim() || "",
    projectId: params.projectId?.trim() || "",
    page,
    pageSize,
    from: (page - 1) * pageSize,
    to: page * pageSize - 1
  };
}
