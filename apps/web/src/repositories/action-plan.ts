import { buildActionPlan } from "@/features/action-plan/engine";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionPlanDecision, ActionPlanItem, Interaction, Relationship, Task, TenantContext } from "@/types/domain";

const ACTION_PLAN_PAGE_SIZE = 1000;

export type ActionPlanRequest = {
  organizationId: string;
  now?: Date;
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
  if (!organization) throw new Error("L'organisation selectionnee est introuvable pour ce tenant.");

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
