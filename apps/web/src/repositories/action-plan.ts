import { buildActionPlan } from "@/features/action-plan/engine";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createInteraction } from "@/repositories/interactions";
import { createTask } from "@/repositories/tasks";
import type { InteractionFormInput } from "@/features/interactions/validation";
import type { TaskFormInput } from "@/features/tasks/validation";
import type { ActionPlanDecision, ActionPlanItem, Interaction, Relationship, Task, TaskStatus, TenantContext } from "@/types/domain";

const ACTION_PLAN_PAGE_SIZE = 1000;

export type ActionPlanRequest = {
  organizationId: string;
  now?: Date;
};

export type ActionPlanDoneTodayItem = {
  id: string;
  title: string;
  completedAt: string;
  href: string;
  kind: "task" | "interaction";
};

type PagedQuery<T> = {
  range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>;
};

async function fetchAllPages<T>(query: PagedQuery<T>) {
  const rows: T[] = [];

  for (let from = 0; ; from += ACTION_PLAN_PAGE_SIZE) {
    const { data, error } = await query.range(from, from + ACTION_PLAN_PAGE_SIZE - 1);
    if (error) throw error;

    const page = data ?? [];
    rows.push(...page);

    if (page.length < ACTION_PLAN_PAGE_SIZE) {
      return rows;
    }
  }
}

export async function getActionPlanForUser(context: TenantContext, request: ActionPlanRequest): Promise<ActionPlanItem[]> {
  const supabase = await createSupabaseServerClient();
  const now = request.now ?? new Date();

  const { data: organization, error: organizationError } = await supabase
    .from("organizations")
    .select("id")
    .eq("tenant_id", context.tenantId)
    .eq("id", request.organizationId)
    .maybeSingle();

  if (organizationError) throw organizationError;
  if (!organization) throw new Error("L’organisation sélectionnée est introuvable pour ce tenant.");

  const typedRelationships = await fetchAllPages<Relationship>(supabase
    .from("relationships")
    .select("*")
    .eq("tenant_id", context.tenantId)
    .eq("organization_id", request.organizationId)
    .order("id", { ascending: true }));

  const relationshipIds = typedRelationships.map((relationship) => relationship.id);

  let tasksQuery = supabase
    .from("tasks")
    .select("*")
    .eq("tenant_id", context.tenantId)
    .is("deleted_at", null)
    .not("status", "in", "(completed,cancelled)");

  tasksQuery = relationshipIds.length > 0
    ? tasksQuery.or(`organization_id.eq.${request.organizationId},relationship_id.in.(${relationshipIds.join(",")})`)
    : tasksQuery.eq("organization_id", request.organizationId);

  const [tasks, decisions, interactions] = await Promise.all([
    fetchAllPages<Task>(tasksQuery.order("id", { ascending: true })),
    fetchAllPages<ActionPlanDecision>(supabase
      .from("action_plan_decisions")
      .select("*")
      .eq("tenant_id", context.tenantId)
      .eq("organization_id", request.organizationId)
      .eq("user_id", context.userId)
      .order("id", { ascending: true })),
    relationshipIds.length > 0
      ? fetchAllPages<Interaction>(supabase
        .from("interactions")
        .select("*")
        .eq("tenant_id", context.tenantId)
        .is("deleted_at", null)
        .in("relationship_id", relationshipIds)
        .order("interaction_date", { ascending: false })
        .order("id", { ascending: true }))
      : Promise.resolve([] as Interaction[])
  ]);

  return buildActionPlan({
    organizationId: request.organizationId,
    userId: context.userId,
    now,
    tasks,
    relationships: typedRelationships,
    interactions,
    decisions
  });
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export async function listActionPlanDoneToday(context: TenantContext, organizationId: string, now = new Date()): Promise<ActionPlanDoneTodayItem[]> {
  const supabase = await createSupabaseServerClient();
  const from = startOfDay(now).toISOString();
  const to = addDays(startOfDay(now), 1).toISOString();

  const { data: relationships, error: relationshipsError } = await supabase
    .from("relationships")
    .select("id")
    .eq("tenant_id", context.tenantId)
    .eq("organization_id", organizationId);

  if (relationshipsError) throw relationshipsError;
  const relationshipIds = (relationships ?? []).map((relationship) => relationship.id as string);

  let taskQuery = supabase
    .from("tasks")
    .select("id, title, completed_at")
    .eq("tenant_id", context.tenantId)
    .eq("status", "completed")
    .is("deleted_at", null)
    .gte("completed_at", from)
    .lt("completed_at", to);

  taskQuery = relationshipIds.length > 0
    ? taskQuery.or(`organization_id.eq.${organizationId},relationship_id.in.(${relationshipIds.join(",")})`)
    : taskQuery.eq("organization_id", organizationId);

  let interactionQuery = supabase
    .from("interactions")
    .select("id, title, interaction_date")
    .eq("tenant_id", context.tenantId)
    .is("deleted_at", null)
    .gte("interaction_date", from)
    .lt("interaction_date", to)
    .eq("metadata->>action_plan", "true");

  interactionQuery = relationshipIds.length > 0
    ? interactionQuery.or(`organization_id.eq.${organizationId},relationship_id.in.(${relationshipIds.join(",")})`)
    : interactionQuery.eq("organization_id", organizationId);

  const [{ data: tasks, error: tasksError }, { data: interactions, error: interactionsError }] = await Promise.all([
    taskQuery.order("completed_at", { ascending: false }),
    interactionQuery.order("interaction_date", { ascending: false })
  ]);

  if (tasksError) throw tasksError;
  if (interactionsError) throw interactionsError;

  return [
    ...((tasks ?? []) as Pick<Task, "id" | "title" | "completed_at">[]).map((task) => ({
      id: task.id,
      title: task.title,
      completedAt: task.completed_at ?? from,
      href: `/tasks/${task.id}`,
      kind: "task" as const
    })),
    ...((interactions ?? []) as Pick<Interaction, "id" | "title" | "interaction_date">[]).map((interaction) => ({
      id: interaction.id,
      title: interaction.title,
      completedAt: interaction.interaction_date,
      href: `/interactions/${interaction.id}`,
      kind: "interaction" as const
    }))
  ].sort((left, right) => new Date(right.completedAt).getTime() - new Date(left.completedAt).getTime());
}

async function getTaskForActionPlan(context: TenantContext, taskId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("tenant_id", context.tenantId)
    .eq("id", taskId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("La tâche est introuvable pour ce tenant.");
  return data as Task;
}

async function updateTaskFields(context: TenantContext, taskId: string, values: Partial<Task>) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tasks")
    .update(values)
    .eq("tenant_id", context.tenantId)
    .eq("id", taskId)
    .is("deleted_at", null)
    .select("*")
    .single();

  if (error) throw error;
  return data as Task;
}

export async function completeActionPlanTask(context: TenantContext, taskId: string) {
  const previous = await getTaskForActionPlan(context, taskId);
  const task = await updateTaskFields(context, taskId, {
    status: "completed",
    completed_at: new Date().toISOString()
  });
  return { task, previousStatus: previous.status, previousCompletedAt: previous.completed_at };
}

export async function restoreActionPlanTask(context: TenantContext, taskId: string, status: TaskStatus, completedAt: string | null) {
  return updateTaskFields(context, taskId, {
    status,
    completed_at: completedAt
  });
}

export async function planActionPlanTask(context: TenantContext, taskId: string, dueAt: string) {
  return updateTaskFields(context, taskId, { due_at: dueAt });
}

async function upsertActionPlanDecision(context: TenantContext, input: {
  organizationId: string;
  recommendationKey: string;
  decisionType: ActionPlanDecision["decision_type"];
  snoozedUntil?: string | null;
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("action_plan_decisions")
    .upsert({
      tenant_id: context.tenantId,
      organization_id: input.organizationId,
      user_id: context.userId,
      recommendation_key: input.recommendationKey,
      decision_type: input.decisionType,
      snoozed_until: input.snoozedUntil ?? null,
      updated_at: new Date().toISOString()
    }, { onConflict: "tenant_id,organization_id,user_id,recommendation_key" })
    .select("*")
    .single();

  if (error) throw error;
  return data as ActionPlanDecision;
}

export async function snoozeActionPlanItem(context: TenantContext, input: {
  itemId: string;
  sourceType: ActionPlanItem["sourceType"];
  sourceId: string;
  organizationId: string;
  snoozedUntil: string;
}) {
  if (input.sourceType === "task") {
    const task = await getTaskForActionPlan(context, input.sourceId);
    await updateTaskFields(context, input.sourceId, {
      snoozed_until: input.snoozedUntil,
      snooze_count: task.snooze_count + 1,
      last_snoozed_at: new Date().toISOString()
    });
  }

  return upsertActionPlanDecision(context, {
    organizationId: input.organizationId,
    recommendationKey: input.itemId,
    decisionType: "snoozed",
    snoozedUntil: input.snoozedUntil
  });
}

export async function createActionPlanInteraction(context: TenantContext, input: {
  itemId: string;
  organizationId: string;
  interaction: InteractionFormInput;
}) {
  const supabase = await createSupabaseServerClient();
  const interaction = await createInteraction(context, {
    ...input.interaction,
    metadata: {
      ...input.interaction.metadata,
      action_plan: true,
      action_plan_item_id: input.itemId
    }
  });

  if (interaction.relationship_id) {
    const { error } = await supabase
      .from("relationships")
      .update({ last_interaction_at: interaction.interaction_date })
      .eq("tenant_id", context.tenantId)
      .eq("id", interaction.relationship_id);

    if (error) throw error;
  }

  await upsertActionPlanDecision(context, {
    organizationId: input.organizationId,
    recommendationKey: input.itemId,
    decisionType: "completed"
  });

  return interaction;
}

export async function createActionPlanTaskFromRecommendation(context: TenantContext, input: {
  itemId: string;
  organizationId: string;
  task: TaskFormInput;
}) {
  const task = await createTask(context, {
    ...input.task,
    metadata: {
      ...input.task.metadata,
      action_plan: true,
      action_plan_item_id: input.itemId
    }
  });

  await upsertActionPlanDecision(context, {
    organizationId: input.organizationId,
    recommendationKey: input.itemId,
    decisionType: "converted_to_task"
  });

  return task;
}
