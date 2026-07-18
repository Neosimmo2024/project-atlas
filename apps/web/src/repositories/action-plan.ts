import { buildActionPlan } from "@/features/action-plan/engine";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionPlanDecision, ActionPlanItem, Interaction, Relationship, Task, TenantContext } from "@/types/domain";

export type ActionPlanRequest = {
  organizationId: string;
  userId?: string;
  now?: Date;
};

export async function getActionPlanForUser(context: TenantContext, request: ActionPlanRequest): Promise<ActionPlanItem[]> {
  const supabase = await createSupabaseServerClient();
  const userId = request.userId ?? context.userId;
  const now = request.now ?? new Date();

  const { data: organization, error: organizationError } = await supabase
    .from("organizations")
    .select("id")
    .eq("tenant_id", context.tenantId)
    .eq("id", request.organizationId)
    .maybeSingle();

  if (organizationError) throw organizationError;
  if (!organization) throw new Error("L'organisation selectionnee est introuvable pour ce tenant.");

  const { data: relationships, error: relationshipsError } = await supabase
    .from("relationships")
    .select("*")
    .eq("tenant_id", context.tenantId)
    .eq("organization_id", request.organizationId)
    .eq("status", "active")
    .limit(500);

  if (relationshipsError) throw relationshipsError;
  const typedRelationships = (relationships ?? []) as Relationship[];
  const relationshipIds = typedRelationships.map((relationship) => relationship.id);

  const [{ data: tasks, error: tasksError }, { data: decisions, error: decisionsError }, interactionsResult] = await Promise.all([
    supabase
      .from("tasks")
      .select("*")
      .eq("tenant_id", context.tenantId)
      .is("deleted_at", null)
      .not("status", "in", "(completed,cancelled)")
      .limit(1000),
    supabase
      .from("action_plan_decisions")
      .select("*")
      .eq("tenant_id", context.tenantId)
      .eq("organization_id", request.organizationId)
      .eq("user_id", userId)
      .limit(500),
    relationshipIds.length > 0
      ? supabase
        .from("interactions")
        .select("*")
        .eq("tenant_id", context.tenantId)
        .is("deleted_at", null)
        .in("relationship_id", relationshipIds)
        .order("interaction_date", { ascending: false })
        .limit(1000)
      : Promise.resolve({ data: [], error: null })
  ]);

  if (tasksError) throw tasksError;
  if (decisionsError) throw decisionsError;
  if (interactionsResult.error) throw interactionsResult.error;

  return buildActionPlan({
    organizationId: request.organizationId,
    userId,
    now,
    tasks: (tasks ?? []) as Task[],
    relationships: typedRelationships,
    interactions: (interactionsResult.data ?? []) as Interaction[],
    decisions: (decisions ?? []) as ActionPlanDecision[]
  });
}
