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

type TenantMemberListingRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role_slug: RoleSlug | null;
  status: "active" | "invited" | "suspended";
};

function assertTenantAdmin(context: TenantContext) {
  if (!canAccessTenantAdministration(context.role)) {
    throw new ApiError("Vous n’avez pas les droits nécessaires pour administrer l’équipe.", 403, "FORBIDDEN");
  }
}

export async function listTenantMembers(context: TenantContext): Promise<TenantMember[]> {
  assertTenantAdmin(context);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_tenant_members_for_admin");

  if (error) throw error;

  return ((data ?? []) as TenantMemberListingRow[]).map((row) => ({
    id: row.user_id,
    userId: row.user_id,
    name: memberDisplayName({ full_name: row.full_name, email: row.email }),
    email: row.email?.trim() || "E-mail non renseigné",
    role: row.role_slug ?? "reader",
    status: row.status,
    isCurrentUser: row.user_id === context.userId
  }));
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
