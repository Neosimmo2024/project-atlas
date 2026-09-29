import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TenantContext } from "@/types/domain";

export async function getTenantContext(): Promise<TenantContext | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  const lookup = (retry = false) => {
    let query = supabase
      .from("tenant_users")
      .select("tenant_id, tenants(id, name), roles(slug)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1);
    // A retry must reach PostgREST, not reuse the failed render-time GET.
    if (retry) query = query.abortSignal(new AbortController().signal);
    return query.maybeSingle();
  };

  let { data, error } = await lookup();
  if (error?.code === "PGRST303") {
    // Observed after session renewal: Auth accepts the user while the data API
    // briefly rejects JWT claims. Retry this read once, never grant access from
    // Auth alone or retry permission/schema errors.
    await new Promise((resolve) => setTimeout(resolve, 250));
    const { data: verified, error: authError } = await supabase.auth.getUser();
    if (authError || verified.user?.id !== user.id) {
      throw new Error("TENANT_CONTEXT_LOOKUP_FAILED");
    }
    ({ data, error } = await lookup(true));
  }

  // A failed lookup is not evidence that the user has no active membership.
  // Do not propagate database messages: they may contain sensitive details.
  if (error) throw new Error("TENANT_CONTEXT_LOOKUP_FAILED");
  if (!data) return null;

  const roleJoin = data.roles as { slug?: TenantContext["role"] } | { slug?: TenantContext["role"] }[] | null;
  const role = Array.isArray(roleJoin) ? roleJoin[0]?.slug : roleJoin?.slug;
  const tenantJoin = data.tenants as { id?: string; name?: string } | { id?: string; name?: string }[] | null;
  const tenant = Array.isArray(tenantJoin) ? tenantJoin[0] : tenantJoin;

  if (!role || !tenant?.id || !tenant.name) {
    throw new Error("TENANT_CONTEXT_INCOMPLETE");
  }

  return { tenantId: data.tenant_id, tenant: { id: tenant.id, name: tenant.name }, userId: user.id, role };
}
