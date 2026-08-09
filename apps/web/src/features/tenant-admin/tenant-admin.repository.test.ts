import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  createSupabaseServerClient: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient
}));

import { listTenantMembers, manageTenantMember } from "@/repositories/tenant-admin";
import type { TenantContext } from "@/types/domain";

const ownerContext: TenantContext = {
  tenantId: "tenant-a",
  tenant: { id: "tenant-a", name: "Atlas QA Beta 1" },
  userId: "owner-a",
  role: "owner"
};

describe("tenant administration repository", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.createSupabaseServerClient.mockReset().mockResolvedValue({ rpc: mocks.rpc });
  });

  it("lists members through the dedicated RPC and does not read profiles directly", async () => {
    const from = vi.fn();
    mocks.createSupabaseServerClient.mockResolvedValue({ rpc: mocks.rpc, from });
    mocks.rpc.mockResolvedValue({
      data: [
        {
          user_id: "renato",
          full_name: "Renato Ponzio",
          email: "renato@example.test",
          role_slug: "owner",
          status: "active"
        },
        {
          user_id: "owner-qa-2",
          full_name: "Owner QA 2",
          email: "owner.qa2@atlas.local.test",
          role_slug: "owner",
          status: "active"
        }
      ],
      error: null
    });

    await expect(listTenantMembers(ownerContext)).resolves.toEqual([
      {
        id: "renato",
        userId: "renato",
        name: "Renato Ponzio",
        email: "renato@example.test",
        role: "owner",
        status: "active",
        isCurrentUser: false
      },
      {
        id: "owner-qa-2",
        userId: "owner-qa-2",
        name: "Owner QA 2",
        email: "owner.qa2@atlas.local.test",
        role: "owner",
        status: "active",
        isCurrentUser: false
      }
    ]);

    expect(mocks.rpc).toHaveBeenCalledWith("list_tenant_members_for_admin");
    expect(from).not.toHaveBeenCalled();
  });

  it("keeps fallback labels only for genuinely incomplete returned data", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ user_id: "missing-profile", full_name: "", email: "", role_slug: null, status: "active" }],
      error: null
    });

    await expect(listTenantMembers({ ...ownerContext, userId: "missing-profile" })).resolves.toEqual([
      {
        id: "missing-profile",
        userId: "missing-profile",
        name: "Utilisateur Atlas",
        email: "E-mail non renseigné",
        role: "reader",
        status: "active",
        isCurrentUser: true
      }
    ]);
  });

  it("preserves manage_tenant_member mutations through the existing RPC", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ user_id: "member-a" }], error: null });

    await expect(manageTenantMember(ownerContext, { targetUserId: "member-a", action: "suspend" })).resolves.toEqual([
      { user_id: "member-a" }
    ]);

    expect(mocks.rpc).toHaveBeenCalledWith("manage_tenant_member", {
      p_target_user_id: "member-a",
      p_action: "suspend",
      p_role_slug: null
    });
  });
});
