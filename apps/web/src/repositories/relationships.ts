import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Relationship, TenantContext } from "@/types/domain";

export async function listRelationships(context: TenantContext): Promise<Relationship[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("relationships")
    .select("*")
    .eq("tenant_id", context.tenantId)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function createRelationship(context: TenantContext, input: Pick<Relationship, "person_id" | "relationship_type"> & Partial<Relationship>) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("relationships")
    .insert({ ...input, tenant_id: context.tenantId })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}
