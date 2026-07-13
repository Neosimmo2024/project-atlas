import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TenantContext } from "@/types/domain";

export async function getTenantContext(): Promise<TenantContext | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from("tenant_users")
    .select("tenant_id, roles(slug)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const roleJoin = data.roles as { slug?: TenantContext["role"] } | { slug?: TenantContext["role"] }[] | null;
  const role = Array.isArray(roleJoin) ? roleJoin[0]?.slug : roleJoin?.slug;

  if (!role) return null;

  return { tenantId: data.tenant_id, userId: user.id, role };
}
