import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Organization, TenantContext } from "@/types/domain";

export async function listOrganizations(context: TenantContext): Promise<Organization[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("*")
    .eq("tenant_id", context.tenantId)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function createOrganization(context: TenantContext, input: Pick<Organization, "name"> & Partial<Organization>) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("organizations")
    .insert({ ...input, tenant_id: context.tenantId })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}
