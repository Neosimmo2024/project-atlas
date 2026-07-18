import { buildTasksSearchOrFilter, canDeleteTasks, normalizeTasksListParams, type TasksSearchParams } from "@/features/tasks/search";
import type { TaskFormInput } from "@/features/tasks/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { recordTaskChanged, recordTaskDeleted } from "@/services/timeline-service";
import type { Interaction, Organization, Person, Project, Relationship, Task, TenantContext } from "@/types/domain";

export type TaskListItem = Task & {
  person: Pick<Person, "id" | "display_name"> | null;
  organization: Pick<Organization, "id" | "name"> | null;
  relationship: Pick<Relationship, "id" | "relationship_type" | "pipeline_stage"> | null;
  interaction: Pick<Interaction, "id" | "title"> | null;
  project: Pick<Project, "id" | "title" | "status" | "stage"> | null;
};

export type TasksListResult = {
  tasks: TaskListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type TaskDetail = {
  task: Task;
  person: Person | null;
  organization: Organization | null;
  relationship: Relationship | null;
  interaction: Interaction | null;
  project: Project | null;
};

type TaskJoinedRow = Task & {
  people?: TaskListItem["person"];
  organizations?: TaskListItem["organization"];
  relationships?: TaskListItem["relationship"];
  interactions?: TaskListItem["interaction"];
  projects?: TaskListItem["project"];
};

function mapTaskRow(row: TaskJoinedRow): TaskListItem {
  return {
    ...row,
    person: row.people ?? null,
    organization: row.organizations ?? null,
    relationship: row.relationships ?? null,
    interaction: row.interactions ?? null,
    project: row.projects ?? null
  };
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export async function listTaskPeopleOptions(context: TenantContext): Promise<Pick<Person, "id" | "display_name">[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("people")
    .select("id, display_name")
    .eq("tenant_id", context.tenantId)
    .order("display_name", { ascending: true })
    .limit(200);

  if (error) throw error;
  return (data ?? []) as Pick<Person, "id" | "display_name">[];
}

export async function listTaskOrganizationOptions(context: TenantContext): Promise<Pick<Organization, "id" | "name">[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("tenant_id", context.tenantId)
    .order("name", { ascending: true })
    .limit(200);

  if (error) throw error;
  return (data ?? []) as Pick<Organization, "id" | "name">[];
}

export async function listTaskRelationshipOptions(context: TenantContext): Promise<Pick<Relationship, "id" | "relationship_type" | "pipeline_stage">[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("relationships")
    .select("id, relationship_type, pipeline_stage")
    .eq("tenant_id", context.tenantId)
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) throw error;
  return (data ?? []) as Pick<Relationship, "id" | "relationship_type" | "pipeline_stage">[];
}

export async function listTaskInteractionOptions(context: TenantContext): Promise<Pick<Interaction, "id" | "title">[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("interactions")
    .select("id, title")
    .eq("tenant_id", context.tenantId)
    .is("deleted_at", null)
    .order("interaction_date", { ascending: false })
    .limit(200);

  if (error) throw error;
  return (data ?? []) as Pick<Interaction, "id" | "title">[];
}

export async function listTasks(context: TenantContext, params: TasksSearchParams = {}): Promise<TasksListResult> {
  const supabase = await createSupabaseServerClient();
  const normalized = normalizeTasksListParams(params);

  let query = supabase
    .from("tasks")
    .select("*, people(id, display_name), organizations(id, name), relationships(id, relationship_type, pipeline_stage), interactions(id, title), projects(id, title, status, stage)", { count: "exact" })
    .eq("tenant_id", context.tenantId)
    .is("deleted_at", null);

  if (normalized.status) query = query.eq("status", normalized.status);
  if (normalized.priority) query = query.eq("priority", normalized.priority);
  if (normalized.personId) query = query.eq("person_id", normalized.personId);
  if (normalized.organizationId) query = query.eq("organization_id", normalized.organizationId);
  if (normalized.relationshipId) query = query.eq("relationship_id", normalized.relationshipId);
  if (normalized.interactionId) query = query.eq("interaction_id", normalized.interactionId);
  if (normalized.projectId) query = query.eq("project_id", normalized.projectId);
  if (normalized.query) query = query.or(buildTasksSearchOrFilter(["title", "description", "reason"], normalized.query));
  if (normalized.due) {
    const today = startOfToday();
    const tomorrow = addDays(today, 1);
    const weekEnd = addDays(today, 7);

    if (normalized.due === "overdue") query = query.lt("due_at", today.toISOString()).neq("status", "completed");
    if (normalized.due === "today") query = query.gte("due_at", today.toISOString()).lt("due_at", tomorrow.toISOString());
    if (normalized.due === "week") query = query.gte("due_at", today.toISOString()).lt("due_at", weekEnd.toISOString());
  }

  const { data, error, count } = await query
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(normalized.from, normalized.to);

  if (error) throw error;

  const total = count ?? 0;
  return {
    tasks: ((data ?? []) as TaskJoinedRow[]).map(mapTaskRow),
    total,
    page: normalized.page,
    pageSize: normalized.pageSize,
    pageCount: Math.max(Math.ceil(total / normalized.pageSize), 1)
  };
}

export async function getTaskDetail(context: TenantContext, taskId: string): Promise<TaskDetail | null> {
  const supabase = await createSupabaseServerClient();
  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select("*")
    .eq("tenant_id", context.tenantId)
    .eq("id", taskId)
    .is("deleted_at", null)
    .maybeSingle();

  if (taskError) throw taskError;
  if (!task) return null;

  const typedTask = task as Task;
  const [{ data: person, error: personError }, { data: organization, error: organizationError }, { data: relationship, error: relationshipError }, { data: interaction, error: interactionError }, { data: project, error: projectError }] = await Promise.all([
    typedTask.person_id ? supabase.from("people").select("*").eq("tenant_id", context.tenantId).eq("id", typedTask.person_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    typedTask.organization_id ? supabase.from("organizations").select("*").eq("tenant_id", context.tenantId).eq("id", typedTask.organization_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    typedTask.relationship_id ? supabase.from("relationships").select("*").eq("tenant_id", context.tenantId).eq("id", typedTask.relationship_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    typedTask.interaction_id ? supabase.from("interactions").select("*").eq("tenant_id", context.tenantId).eq("id", typedTask.interaction_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    typedTask.project_id ? supabase.from("projects").select("*").eq("tenant_id", context.tenantId).eq("id", typedTask.project_id).maybeSingle() : Promise.resolve({ data: null, error: null })
  ]);

  if (personError) throw personError;
  if (organizationError) throw organizationError;
  if (relationshipError) throw relationshipError;
  if (interactionError) throw interactionError;
  if (projectError) throw projectError;

  return {
    task: typedTask,
    person: person as Person | null,
    organization: organization as Organization | null,
    relationship: relationship as Relationship | null,
    interaction: interaction as Interaction | null,
    project: project as Project | null
  };
}

async function assertTaskReferencesBelongToTenant(context: TenantContext, input: TaskFormInput) {
  const supabase = await createSupabaseServerClient();

  async function assertReference(table: "people" | "organizations" | "relationships" | "interactions" | "projects", id: string | null | undefined, message: string) {
    if (!id) return;
    const { data, error } = await supabase.from(table).select("id").eq("tenant_id", context.tenantId).eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error(message);
  }

  await Promise.all([
    assertReference("people", input.person_id, "La personne selectionnee est introuvable pour ce tenant."),
    assertReference("organizations", input.organization_id, "L'organisation selectionnee est introuvable pour ce tenant."),
    assertReference("relationships", input.relationship_id, "La relation selectionnee est introuvable pour ce tenant."),
    assertReference("interactions", input.interaction_id, "L'interaction selectionnee est introuvable pour ce tenant."),
    assertReference("projects", input.project_id, "Le projet selectionne est introuvable pour ce tenant.")
  ]);
}

function taskPayload(input: TaskFormInput) {
  const status = input.status;
  return {
    ...input,
    completed_at: status === "completed" ? new Date().toISOString() : null
  };
}

export async function createTask(context: TenantContext, input: TaskFormInput) {
  await assertTaskReferencesBelongToTenant(context, input);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tasks")
    .insert({ ...taskPayload(input), tenant_id: context.tenantId, created_by: context.userId })
    .select("*")
    .single();

  if (error) throw error;
  const task = data as Task;
  await recordTaskChanged(context, task);
  return task;
}

export async function updateTask(context: TenantContext, taskId: string, input: TaskFormInput) {
  await assertTaskReferencesBelongToTenant(context, input);
  const supabase = await createSupabaseServerClient();
  const { data: previous, error: previousError } = await supabase
    .from("tasks")
    .select("*")
    .eq("tenant_id", context.tenantId)
    .eq("id", taskId)
    .is("deleted_at", null)
    .maybeSingle();

  if (previousError) throw previousError;

  const { data, error } = await supabase
    .from("tasks")
    .update(taskPayload(input))
    .eq("tenant_id", context.tenantId)
    .eq("id", taskId)
    .is("deleted_at", null)
    .select("*")
    .single();

  if (error) throw error;
  const task = data as Task;
  await recordTaskChanged(context, task, previous as Task | null);
  return task;
}

export async function deleteTask(context: TenantContext, taskId: string) {
  if (!canDeleteTasks(context.role)) {
    return { allowed: false, deleted: false };
  }

  const supabase = await createSupabaseServerClient();
  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select("*")
    .eq("tenant_id", context.tenantId)
    .eq("id", taskId)
    .is("deleted_at", null)
    .maybeSingle();

  if (taskError) throw taskError;

  const { error } = await supabase
    .from("tasks")
    .update({ deleted_at: new Date().toISOString() })
    .eq("tenant_id", context.tenantId)
    .eq("id", taskId)
    .is("deleted_at", null);

  if (error) throw error;
  if (task) await recordTaskDeleted(context, task as Task);
  return { allowed: true, deleted: true };
}

export async function listPersonTasks(context: TenantContext, personId: string) {
  return listTasks(context, { personId, page: 1, pageSize: 10 });
}

export async function listOrganizationTasks(context: TenantContext, organizationId: string) {
  return listTasks(context, { organizationId, page: 1, pageSize: 10 });
}

export async function listRelationshipTasks(context: TenantContext, relationshipId: string) {
  return listTasks(context, { relationshipId, page: 1, pageSize: 10 });
}

export async function listInteractionTasks(context: TenantContext, interactionId: string) {
  return listTasks(context, { interactionId, page: 1, pageSize: 10 });
}

export async function listProjectTasks(context: TenantContext, projectId: string) {
  return listTasks(context, { projectId, page: 1, pageSize: 10 });
}
