import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/types/domain";

const mocks = vi.hoisted(() => ({
  getTenantContext: vi.fn(),
  listTenantMembers: vi.fn(),
  manageTenantMember: vi.fn()
}));

vi.mock("@/repositories/tenant-context", () => ({
  getTenantContext: mocks.getTenantContext
}));

vi.mock("@/repositories/tenant-admin", () => ({
  listTenantMembers: mocks.listTenantMembers,
  manageTenantMember: mocks.manageTenantMember
}));

const ownerContext: TenantContext = {
  tenantId: "tenant-a",
  tenant: { id: "tenant-a", name: "Tenant A" },
  userId: "owner-a",
  role: "owner"
};

describe("tenant administration API", () => {
  beforeEach(() => {
    mocks.getTenantContext.mockReset().mockResolvedValue(ownerContext);
    mocks.listTenantMembers.mockReset().mockResolvedValue([]);
    mocks.manageTenantMember.mockReset().mockResolvedValue([]);
  });

  it("lists tenant members through the server context", async () => {
    const { GET } = await import("../../app/api/admin/team/route");
    const response = await GET();

    expect(response.status).toBe(200);
    expect(mocks.listTenantMembers).toHaveBeenCalledWith(ownerContext);
  });

  it("returns 401 without an authenticated tenant context", async () => {
    const { GET } = await import("../../app/api/admin/team/route");
    mocks.getTenantContext.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it("calls the role mutation without accepting a tenant id from the browser", async () => {
    const { PATCH } = await import("../../app/api/admin/team/[userId]/route");
    const response = await PATCH(
      new Request("http://localhost/api/admin/team/member-a", {
        method: "PATCH",
        body: JSON.stringify({ action: "change_role", role: "manager", tenantId: "tenant-b" })
      }),
      { params: Promise.resolve({ userId: "member-a" }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.manageTenantMember).toHaveBeenCalledWith(ownerContext, {
      targetUserId: "member-a",
      action: "change_role",
      role: "manager"
    });
  });

  it("rejects unsupported actions before repository mutation", async () => {
    const { PATCH } = await import("../../app/api/admin/team/[userId]/route");
    const response = await PATCH(
      new Request("http://localhost/api/admin/team/member-a", {
        method: "PATCH",
        body: JSON.stringify({ action: "delete" })
      }),
      { params: Promise.resolve({ userId: "member-a" }) }
    );

    expect(response.status).toBe(400);
    expect(mocks.manageTenantMember).not.toHaveBeenCalled();
  });
});
