import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Person, TenantContext } from "@/types/domain";

export async function listPeople(context: TenantContext): Promise<Person[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("people")
    .select("*")
    .eq("tenant_id", context.tenantId)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function createPerson(context: TenantContext, input: Pick<Person, "display_name"> & Partial<Person>) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("people")
    .insert({ ...input, tenant_id: context.tenantId })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}
