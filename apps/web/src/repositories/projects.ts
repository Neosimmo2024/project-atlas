import { buildProjectsSearchOrFilter, normalizeProjectsListParams, type ProjectsSearchParams } from "@/features/projects/search";
import type { ProjectArchiveInput, ProjectFormInput, ProjectLoseInput, ProjectWinInput } from "@/features/projects/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  recordProjectArchived,
  recordProjectCreated,
  recordProjectLost,
  recordProjectReactivated,
  recordProjectReopened,
  recordProjectUpdated,
  recordProjectWon
} from "@/services/timeline-service";
import type { Organization, Person, Project, ProjectLossReason, ProjectStatus, Relationship, Task, TenantContext } from "@/types/domain";

const PROJECT_PAGE_SIZE = 1000;
const OPEN_TASK_STATUSES = ["todo", "in_progress", "waiting"] as const;

export type ProjectListItem = Project & {
  person: Pick<Person, "id" | "display_name"> | null;
  organization: Pick<Organization, "id" | "name"> | null;
  relationship: Pick<Relationship, "id" | "relationship_type" | "pipeline_stage"> | null;
  nextAction: ProjectNextAction | null;
  lastActivityAt: string;
};

export type ProjectDetail = {
  project: Project;
  person: Person | null;
  organization: Organization | null;
  relationship: Relationship | null;
  nextAction: ProjectNextAction | null;
  lastActivityAt: string;
};

export type ProjectsListResult = {
  projects: ProjectListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type ProjectNextAction = {
  taskId: string;
  title: string;
  dueAt: string | null;
  priority: Task["priority"];
  reason: "overdue" | "today" | "next_due" | "priority_without_due";
};

type ProjectJoinedRow = Project & {
  people?: ProjectListItem["person"];
  organizations?: ProjectListItem["organization"];
  relationships?: ProjectListItem["relationship"];
};

type PagedQuery<T> = {
  range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown; count?: number | null }>;
};

async function fetchAllPages<T>(query: PagedQuery<T>) {
  const rows: T[] = [];
  let total: number | null = null;

  for (let from = 0; ; from += PROJECT_PAGE_SIZE) {
    const { data, error, count } = await query.range(from, from + PROJECT_PAGE_SIZE - 1);
    if (error) throw error;
    if (typeof count === "number") total = count;

    const page = data ?? [];
    rows.push(...page);
    if (page.length < PROJECT_PAGE_SIZE) return { rows, total: total ?? rows.length };
  }
}

function mapProjectRow(row: ProjectJoinedRow): Omit<ProjectListItem, "nextAction" | "lastActivityAt"> {
  return {
    ...row,
    person: row.people ?? null,
    organization: row.organizations ?? null,
    relationship: row.relationships ?? null
  };
}

function statusRank(status: ProjectStatus) {
  if (status === "open") return 0;
  if (status === "won") return 1;
  return 2;
}

function nextActionRank(action: ProjectNextAction | null) {
  if (!action) return 4;
  if (action.reason === "overdue") return 0;
  if (action.reason === "today") return 1;
  if (action.reason === "next_due") return 2;
  return 3;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function taskToNextAction(task: Task, reason: ProjectNextAction["reason"]): ProjectNextAction {
  return {
    taskId: task.id,
    title: task.title,
    dueAt: task.due_at,
    priority: task.priority,
    reason
  };
}

export function calculateProjectNextAction(tasks: Task[], now = new Date()): ProjectNextAction | null {
  const openTasks = tasks.filter((task) => task.project_id && OPEN_TASK_STATUSES.includes(task.status as (typeof OPEN_TASK_STATUSES)[number]) && !task.deleted_at);
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);

  const overdue = openTasks
    .filter((task) => task.due_at && new Date(task.due_at) < today)
    .sort((left, right) => new Date(left.due_at ?? 0).getTime() - new Date(right.due_at ?? 0).getTime() || left.id.localeCompare(right.id))[0];
  if (overdue) return taskToNextAction(overdue, "overdue");

  const dueToday = openTasks
    .filter((task) => task.due_at && new Date(task.due_at) >= today && new Date(task.due_at) < tomorrow)
    .sort((left, right) => new Date(left.due_at ?? 0).getTime() - new Date(right.due_at ?? 0).getTime() || left.id.localeCompare(right.id))[0];
  if (dueToday) return taskToNextAction(dueToday, "today");

  const nextDue = openTasks
    .filter((task) => task.due_at)
    .sort((left, right) => new Date(left.due_at ?? 0).getTime() - new Date(right.due_at ?? 0).getTime() || left.id.localeCompare(right.id))[0];
  if (nextDue) return taskToNextAction(nextDue, "next_due");

  const priorityWithoutDue = openTasks
    .filter((task) => !task.due_at && (task.priority === "critical" || task.priority === "high"))
    .sort((left, right) => priorityValue(right.priority) - priorityValue(left.priority) || new Date(left.created_at).getTime() - new Date(right.created_at).getTime() || left.id.localeCompare(right.id))[0];
  return priorityWithoutDue ? taskToNextAction(priorityWithoutDue, "priority_without_due") : null;
}

function priorityValue(priority: Task["priority"]) {
  if (priority === "critical") return 4;
  if (priority === "high") return 3;
  if (priority === "normal") return 2;
  return 1;
}

function groupTasksByProject(tasks: Task[]) {
  const grouped = new Map<string, Task[]>();
  for (const task of tasks) {
    if (!task.project_id) continue;
    grouped.set(task.project_id, [...(grouped.get(task.project_id) ?? []), task]);
  }
  return grouped;
}

async function listProjectActivityInputs(context: TenantContext, projectIds: string[]) {
  if (projectIds.length === 0) return { tasks: [] as Task[], lastEvents: new Map<string, string>() };
  const supabase = await createSupabaseServerClient();
  const [{ data: tasks, error: tasksError }, { data: events, error: eventsError }] = await Promise.all([
    supabase
      .from("tasks")
      .select("*")
      .eq("tenant_id", context.tenantId)
      .in("project_id", projectIds)
      .is("deleted_at", null),
    supabase
      .from("timeline_events")
      .select("project_id, occurred_at")
      .eq("tenant_id", context.tenantId)
      .in("project_id", projectIds)
      .is("deleted_at", null)
      .order("occurred_at", { ascending: false })
  ]);

  if (tasksError) throw tasksError;
  if (eventsError) throw eventsError;

  const lastEvents = new Map<string, string>();
  for (const event of events ?? []) {
    const typed = event as { project_id: string | null; occurred_at: string };
    if (typed.project_id && !lastEvents.has(typed.project_id)) lastEvents.set(typed.project_id, typed.occurred_at);
  }
  return { tasks: (tasks ?? []) as Task[], lastEvents };
}

function enrichProjects(context: TenantContext, projects: Omit<ProjectListItem, "nextAction" | "lastActivityAt">[], tasks: Task[], lastEvents: Map<string, string>, now = new Date()): ProjectListItem[] {
  const tasksByProject = groupTasksByProject(tasks);
  return projects.map((project) => ({
    ...project,
    nextAction: calculateProjectNextAction(tasksByProject.get(project.id) ?? [], now),
    lastActivityAt: lastEvents.get(project.id) ?? project.created_at
  }));
}

function sortProjects(projects: ProjectListItem[]) {
  return [...projects].sort((left, right) => {
    const status = statusRank(left.status) - statusRank(right.status);
    if (status !== 0) return status;

    const action = nextActionRank(left.nextAction) - nextActionRank(right.nextAction);
    if (action !== 0) return action;

    const leftDue = left.nextAction?.dueAt ? new Date(left.nextAction.dueAt).getTime() : Number.POSITIVE_INFINITY;
    const rightDue = right.nextAction?.dueAt ? new Date(right.nextAction.dueAt).getTime() : Number.POSITIVE_INFINITY;
    if (leftDue !== rightDue) return leftDue - rightDue;

    const activity = new Date(right.lastActivityAt).getTime() - new Date(left.lastActivityAt).getTime();
    if (activity !== 0) return activity;

    return left.id.localeCompare(right.id);
  });
}

async function assertOwnerBelongsToTenant(context: TenantContext, ownerUserId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tenant_users")
    .select("id")
    .eq("tenant_id", context.tenantId)
    .eq("user_id", ownerUserId)
    .eq("status", "active")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Le responsable du Projet est introuvable pour ce tenant.");
}

async function normalizeProjectReferences(context: TenantContext, input: ProjectFormInput) {
  const supabase = await createSupabaseServerClient();
  const refs = {
    person_id: input.person_id ?? null,
    organization_id: input.organization_id ?? null,
    relationship_id: input.relationship_id ?? null
  };

  if (refs.relationship_id) {
    const { data: relationship, error } = await supabase
      .from("relationships")
      .select("id, person_id, organization_id")
      .eq("tenant_id", context.tenantId)
      .eq("id", refs.relationship_id)
      .maybeSingle();
    if (error) throw error;
    if (!relationship) throw new Error("La relation du Projet est introuvable pour ce tenant.");

    const typed = relationship as Pick<Relationship, "id" | "person_id" | "organization_id">;
    if (refs.person_id && refs.person_id !== typed.person_id) throw new Error("La personne fournie ne correspond pas à la relation du Projet.");
    if (refs.organization_id && refs.organization_id !== typed.organization_id) throw new Error("L’organisation fournie ne correspond pas à la relation du Projet.");
    refs.person_id = refs.person_id ?? typed.person_id;
    refs.organization_id = refs.organization_id ?? typed.organization_id;
  }

  async function assertReference(table: "people" | "organizations", id: string | null, message: string) {
    if (!id) return;
    const { data, error } = await supabase.from(table).select("id").eq("tenant_id", context.tenantId).eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error(message);
  }

  await Promise.all([
    assertReference("people", refs.person_id, "La personne du Projet est introuvable pour ce tenant."),
    assertReference("organizations", refs.organization_id, "L’organisation du Projet est introuvable pour ce tenant.")
  ]);

  return refs;
}

function projectPayload(context: TenantContext, input: ProjectFormInput, refs: { person_id: string | null; organization_id: string | null; relationship_id: string | null }) {
  const status = input.status ?? "open";
  return {
    title: input.title,
    short_description: input.short_description ?? null,
    project_type: input.project_type,
    status,
    stage: input.stage ?? "new",
    owner_user_id: input.owner_user_id ?? context.userId,
    organization_id: refs.organization_id,
    person_id: refs.person_id,
    relationship_id: refs.relationship_id,
    estimated_value: input.estimated_value,
    final_value: status === "won" ? input.final_value : null,
    currency: input.currency ?? "EUR",
    expected_close_at: input.expected_close_at ?? null,
    won_at: status === "won" ? input.won_at ?? new Date().toISOString() : null,
    lost_at: status === "lost" ? input.lost_at ?? new Date().toISOString() : null,
    loss_reason: status === "lost" ? input.loss_reason ?? null : null,
    closing_note: input.closing_note ?? null,
    archived_at: input.archived_at ?? null,
    metadata: input.metadata ?? {}
  };
}

export async function listProjects(context: TenantContext, params: ProjectsSearchParams = {}): Promise<ProjectsListResult> {
  const supabase = await createSupabaseServerClient();
  const normalized = normalizeProjectsListParams(params);

  let query = supabase
    .from("projects")
    .select("*, people(id, display_name), organizations(id, name), relationships(id, relationship_type, pipeline_stage)", { count: "exact" })
    .eq("tenant_id", context.tenantId);

  if (!normalized.includeArchived) query = query.is("archived_at", null);
  if (normalized.organizationId) query = query.eq("organization_id", normalized.organizationId);
  if (normalized.personId) query = query.eq("person_id", normalized.personId);
  if (normalized.relationshipId) query = query.eq("relationship_id", normalized.relationshipId);
  if (normalized.ownerId) query = query.eq("owner_user_id", normalized.ownerId);
  if (normalized.type) query = query.eq("project_type", normalized.type);
  if (normalized.status) query = query.eq("status", normalized.status);
  if (normalized.stage) query = query.eq("stage", normalized.stage);
  if (normalized.query) query = query.or(buildProjectsSearchOrFilter(["title", "short_description", "closing_note"], normalized.query));

  const { rows, total } = await fetchAllPages<ProjectJoinedRow>(query.order("id", { ascending: true }));
  const projects = rows.map(mapProjectRow);
  const { tasks, lastEvents } = await listProjectActivityInputs(context, projects.map((project) => project.id));
  const sorted = sortProjects(enrichProjects(context, projects, tasks, lastEvents));
  const paged = sorted.slice(normalized.from, normalized.to + 1);

  return {
    projects: paged,
    total,
    page: normalized.page,
    pageSize: normalized.pageSize,
    pageCount: Math.max(Math.ceil(total / normalized.pageSize), 1)
  };
}

export async function getProjectDetail(context: TenantContext, projectId: string): Promise<ProjectDetail | null> {
  const supabase = await createSupabaseServerClient();
  const { data: project, error } = await supabase.from("projects").select("*").eq("tenant_id", context.tenantId).eq("id", projectId).maybeSingle();
  if (error) throw error;
  if (!project) return null;

  const typed = project as Project;
  const [{ data: person, error: personError }, { data: organization, error: organizationError }, { data: relationship, error: relationshipError }] = await Promise.all([
    typed.person_id ? supabase.from("people").select("*").eq("tenant_id", context.tenantId).eq("id", typed.person_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    typed.organization_id ? supabase.from("organizations").select("*").eq("tenant_id", context.tenantId).eq("id", typed.organization_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    typed.relationship_id ? supabase.from("relationships").select("*").eq("tenant_id", context.tenantId).eq("id", typed.relationship_id).maybeSingle() : Promise.resolve({ data: null, error: null })
  ]);
  if (personError) throw personError;
  if (organizationError) throw organizationError;
  if (relationshipError) throw relationshipError;

  const { tasks, lastEvents } = await listProjectActivityInputs(context, [typed.id]);
  const nextAction = calculateProjectNextAction(tasks, new Date());
  return {
    project: typed,
    person: person as Person | null,
    organization: organization as Organization | null,
    relationship: relationship as Relationship | null,
    nextAction,
    lastActivityAt: lastEvents.get(typed.id) ?? typed.created_at
  };
}

export async function createProject(context: TenantContext, input: ProjectFormInput) {
  const ownerUserId = input.owner_user_id ?? context.userId;
  await assertOwnerBelongsToTenant(context, ownerUserId);
  const refs = await normalizeProjectReferences(context, input);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({ ...projectPayload(context, { ...input, owner_user_id: ownerUserId }, refs), tenant_id: context.tenantId, created_by: context.userId })
    .select("*")
    .single();

  if (error) throw error;
  const project = data as Project;
  await recordProjectCreated(context, project);
  return project;
}

export async function updateProject(context: TenantContext, projectId: string, input: ProjectFormInput) {
  const supabase = await createSupabaseServerClient();
  const { data: previous, error: previousError } = await supabase.from("projects").select("*").eq("tenant_id", context.tenantId).eq("id", projectId).maybeSingle();
  if (previousError) throw previousError;
  if (!previous) throw new Error("Le Projet est introuvable pour ce tenant.");

  const ownerUserId = input.owner_user_id ?? (previous as Project).owner_user_id;
  await assertOwnerBelongsToTenant(context, ownerUserId);
  const refs = await normalizeProjectReferences(context, input);
  const { data, error } = await supabase
    .from("projects")
    .update(projectPayload(context, { ...input, owner_user_id: ownerUserId }, refs))
    .eq("tenant_id", context.tenantId)
    .eq("id", projectId)
    .select("*")
    .single();

  if (error) throw error;
  const project = data as Project;
  await recordProjectUpdated(context, project, previous as Project);
  return project;
}

async function updateProjectStatus(context: TenantContext, projectId: string, values: Partial<Project>) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("projects")
    .update(values)
    .eq("tenant_id", context.tenantId)
    .eq("id", projectId)
    .select("*")
    .single();
  if (error) throw error;
  return data as Project;
}

export async function winProject(context: TenantContext, projectId: string, input: ProjectWinInput) {
  const project = await updateProjectStatus(context, projectId, {
    status: "won",
    won_at: input.wonAt ?? new Date().toISOString(),
    lost_at: null,
    loss_reason: null,
    final_value: input.finalValue,
    closing_note: input.note ?? null
  });
  await recordProjectWon(context, project);
  return project;
}

export async function loseProject(context: TenantContext, projectId: string, input: ProjectLoseInput) {
  const project = await updateProjectStatus(context, projectId, {
    status: "lost",
    lost_at: input.lostAt ?? new Date().toISOString(),
    won_at: null,
    final_value: null,
    loss_reason: input.lossReason as ProjectLossReason,
    closing_note: input.note ?? null
  });
  await recordProjectLost(context, project);
  return project;
}

export async function reopenProject(context: TenantContext, projectId: string) {
  const project = await updateProjectStatus(context, projectId, {
    status: "open",
    won_at: null,
    lost_at: null,
    loss_reason: null,
    final_value: null
  });
  await recordProjectReopened(context, project);
  return project;
}

export async function archiveProject(context: TenantContext, projectId: string, input: ProjectArchiveInput) {
  const project = await updateProjectStatus(context, projectId, {
    archived_at: input.archivedAt ?? new Date().toISOString(),
    closing_note: input.note ?? null
  });
  await recordProjectArchived(context, project);
  return project;
}

export async function reactivateProject(context: TenantContext, projectId: string) {
  const project = await updateProjectStatus(context, projectId, {
    archived_at: null
  });
  await recordProjectReactivated(context, project);
  return project;
}
