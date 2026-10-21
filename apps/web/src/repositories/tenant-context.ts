import { cookies } from "next/headers";
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
    .eq("status", "active");
  if (error || !data?.length) return null;

  const requestedId = (await cookies()).get("atlas_active_tenant")?.value;
  const selected = data.find((entry) => entry.tenant_id === requestedId) ?? data[0];
  const roleJoin = selected.roles as { slug?: TenantContext["role"] } | { slug?: TenantContext["role"] }[] | null;
  const role = Array.isArray(roleJoin) ? roleJoin[0]?.slug : roleJoin?.slug;
  const tenantJoin = selected.tenants as { id?: string; name?: string } | { id?: string; name?: string }[] | null;
  const tenant = Array.isArray(tenantJoin) ? tenantJoin[0] : tenantJoin;
  if (!role || !tenant?.id || !tenant.name) return null;
  return { tenantId: selected.tenant_id, tenant: { id: tenant.id, name: tenant.name }, userId: user.id, role };
}

export async function getAvailableTenants(): Promise<Array<{ id: string; name: string }>> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase.from("tenant_users")
    .select("tenant_id, tenants(id, name)").eq("user_id", user.id).eq("status", "active");
  if (error || !data) return [];
  return data.flatMap((entry) => {
    const joined = entry.tenants as { id?: string; name?: string } | { id?: string; name?: string }[] | null;
    const tenant = Array.isArray(joined) ? joined[0] : joined;
    return tenant?.id && tenant.name ? [{ id: tenant.id, name: tenant.name }] : [];
  });
}
