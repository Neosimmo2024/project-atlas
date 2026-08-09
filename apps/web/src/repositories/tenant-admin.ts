import { ApiError } from "@/lib/api-errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  canAccessTenantAdministration,
  memberDisplayName,
  tenantMemberPublicMessage,
  type TenantMember,
  type TenantMemberAction
} from "@/features/tenant-admin/tenant-admin";
import type { RoleSlug, TenantContext } from "@/types/domain";

type TenantUserRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  status: "active" | "invited" | "suspended";
  roles: { slug?: RoleSlug } | { slug?: RoleSlug }[] | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
};

function single<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function assertTenantAdmin(context: TenantContext) {
  if (!canAccessTenantAdministration(context.role)) {
    throw new ApiError("Vous n’avez pas les droits nécessaires pour administrer l’équipe.", 403, "FORBIDDEN");
  }
}

export async function listTenantMembers(context: TenantContext): Promise<TenantMember[]> {
  assertTenantAdmin(context);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tenant_users")
    .select("id, tenant_id, user_id, status, roles(slug)")
    .eq("tenant_id", context.tenantId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  const userIds = [...new Set((data ?? []).map((row) => row.user_id))];
  const { data: profiles, error: profilesError } = userIds.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", userIds)
    : { data: [], error: null };

  if (profilesError) throw profilesError;

  const profileById = new Map(((profiles ?? []) as ProfileRow[]).map((profile) => [profile.id, profile]));

  return ((data ?? []) as TenantUserRow[]).map((row) => {
    const role = single(row.roles)?.slug ?? "reader";
    const profile = profileById.get(row.user_id);

    return {
      id: row.id,
      userId: row.user_id,
      name: memberDisplayName(profile ?? {}),
      email: profile?.email?.trim() || "E-mail non renseigné",
      role,
      status: row.status,
      isCurrentUser: row.user_id === context.userId
    };
  });
}

export async function manageTenantMember(
  context: TenantContext,
  input: { targetUserId: string; action: TenantMemberAction; role?: RoleSlug }
) {
  assertTenantAdmin(context);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("manage_tenant_member", {
    p_target_user_id: input.targetUserId,
    p_action: input.action,
    p_role_slug: input.role ?? null
  });

  if (error) {
    throw new ApiError(tenantMemberPublicMessage(error.message), error.code === "42501" ? 403 : 400, error.message);
  }

  return data;
}
