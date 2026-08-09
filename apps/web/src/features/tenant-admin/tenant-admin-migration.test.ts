import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(process.cwd(), "../..");
const migration = readFileSync(join(repoRoot, "supabase/migrations/0015_tenant_user_administration.sql"), "utf8");

describe("tenant user administration migration", () => {
  it("removes broad direct authenticated mutations and keeps member reads policy separate", () => {
    expect(migration).toContain("revoke insert, update, delete on table public.tenant_users from authenticated");
    expect(migration).toContain("drop policy if exists tenant_users_manage_for_owners_and_admins");
    expect(migration).not.toMatch(/create policy tenant_users_manage_for_owners_and_admins/i);
  });

  it("creates a locked security definer RPC with safe grants", () => {
    expect(migration).toContain("create or replace function public.manage_tenant_member");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = public, pg_temp");
    expect(migration).toContain("for update");
    expect(migration).toContain("revoke all on function public.manage_tenant_member");
    expect(migration).toContain("grant execute on function public.manage_tenant_member(uuid, text, text) to authenticated, service_role");
  });

  it("rejects forbidden roles, invited transitions, cross tenant targets and last owner loss", () => {
    expect(migration).toContain("p_action not in ('change_role', 'suspend', 'reactivate')");
    expect(migration).toContain("p_role_slug not in ('owner', 'admin', 'recruiter', 'manager', 'reader')");
    expect(migration).toContain("v_target_status = 'invited'");
    expect(migration).toContain("tu.tenant_id = v_actor_tenant_id");
    expect(migration).toContain("TENANT_MEMBER_LAST_OWNER_PROTECTED");
    expect(migration).toContain("TENANT_MEMBER_SELF_SUSPEND_FORBIDDEN");
    expect(migration).not.toMatch(/\bdelete\s+from\s+public\.tenant_users/i);
    expect(migration).not.toMatch(/\binsert\s+into\s+public\.tenant_users/i);
  });
});
