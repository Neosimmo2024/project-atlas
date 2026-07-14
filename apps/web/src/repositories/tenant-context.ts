import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TenantContext } from "@/types/domain";

export async function getTenantContext(): Promise<TenantContext | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from("tenant_users")
    .select("tenant_id, tenants(id, name), roles(slug)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const roleJoin = data.roles as { slug?: TenantContext["role"] } | { slug?: TenantContext["role"] }[] | null;
  const role = Array.isArray(roleJoin) ? roleJoin[0]?.slug : roleJoin?.slug;
  const tenantJoin = data.tenants as { id?: string; name?: string } | { id?: string; name?: string }[] | null;
  const tenant = Array.isArray(tenantJoin) ? tenantJoin[0] : tenantJoin;

  if (!role || !tenant?.id || !tenant.name) return null;

  return { tenantId: data.tenant_id, tenant: { id: tenant.id, name: tenant.name }, userId: user.id, role };
}
