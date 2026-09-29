import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTenantContext } from "./tenant-context";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  maybeSingle: vi.fn(),
  from: vi.fn(),
  abortSignal: vi.fn().mockReturnThis()
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.from
  })
}));

describe("tenant context lookup failures", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.abortSignal.mockReturnThis();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-a" } } });
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      abortSignal: mocks.abortSignal,
      maybeSingle: mocks.maybeSingle
    };
    mocks.from.mockReturnValue(query);
  });

  it("keeps an absent membership distinct from a failed lookup", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(getTenantContext()).resolves.toBeNull();
    mocks.maybeSingle.mockResolvedValue({
      data: null, error: { message: "private database details", code: "42501" }
    });
    await expect(getTenantContext()).rejects.toThrow(/^TENANT_CONTEXT_LOOKUP_FAILED$/);
  });

  it("allows a fresh request to recover after a failed lookup", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: "unavailable" } });
    await expect(getTenantContext()).rejects.toThrow("TENANT_CONTEXT_LOOKUP_FAILED");
    mocks.maybeSingle.mockResolvedValueOnce({
      data: { tenant_id: "tenant-a", tenants: { id: "tenant-a", name: "Tenant A" }, roles: { slug: "owner" } },
      error: null
    });
    await expect(getTenantContext()).resolves.toEqual({
      tenantId: "tenant-a", tenant: { id: "tenant-a", name: "Tenant A" }, userId: "user-a", role: "owner"
    });
  });

  it("does not invent membership when joins are incomplete", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { tenant_id: "tenant-a", tenants: null, roles: { slug: "owner" } }, error: null
    });
    await expect(getTenantContext()).rejects.toThrow("TENANT_CONTEXT_INCOMPLETE");
  });

  it("preserves array-shaped joins", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { tenant_id: "tenant-b", tenants: [{ id: "tenant-b", name: "Tenant B" }], roles: [{ slug: "admin" }] },
      error: null
    });
    await expect(getTenantContext()).resolves.toMatchObject({ tenantId: "tenant-b", role: "admin" });
  });

  it("does not query memberships for an unauthenticated user", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    await expect(getTenantContext()).resolves.toBeNull();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("recovers from a transient JWT claims rejection after verifying the same user", async () => {
    mocks.maybeSingle
      .mockResolvedValueOnce({ data: null, error: { code: "PGRST303" } })
      .mockResolvedValueOnce({
        data: { tenant_id: "tenant-a", tenants: { id: "tenant-a", name: "Tenant A" }, roles: { slug: "owner" } },
        error: null
      });
    await expect(getTenantContext()).resolves.toMatchObject({ tenantId: "tenant-a", userId: "user-a" });
    expect(mocks.getUser).toHaveBeenCalledTimes(2);
    expect(mocks.maybeSingle).toHaveBeenCalledTimes(2);
    expect(mocks.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it("fails closed after a second JWT rejection without exposing database details", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { code: "PGRST303", message: "private JWT details" } });
    await expect(getTenantContext()).rejects.toThrow(/^TENANT_CONTEXT_LOOKUP_FAILED$/);
    expect(mocks.maybeSingle).toHaveBeenCalledTimes(2);
  });

  it.each([
    { data: { user: null }, error: null },
    { data: { user: { id: "user-b" } }, error: null },
    { data: { user: { id: "user-a" } }, error: { message: "auth failed" } }
  ])("does not retry when identity revalidation fails or changes", async (verification) => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: { id: "user-a" } } }).mockResolvedValueOnce(verification);
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { code: "PGRST303" } });
    await expect(getTenantContext()).rejects.toThrow(/^TENANT_CONTEXT_LOOKUP_FAILED$/);
    expect(mocks.maybeSingle).toHaveBeenCalledTimes(1);
    expect(mocks.abortSignal).not.toHaveBeenCalled();
  });

  it.each(["42501", "PGRST301", "PGRST200"])("does not retry other errors: %s", async (code) => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { code } });
    await expect(getTenantContext()).rejects.toThrow(/^TENANT_CONTEXT_LOOKUP_FAILED$/);
    expect(mocks.maybeSingle).toHaveBeenCalledTimes(1);
    expect(mocks.getUser).toHaveBeenCalledTimes(1);
  });

  it("keeps an absent membership absent after a successful retry", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: { code: "PGRST303" } })
      .mockResolvedValueOnce({ data: null, error: null });
    await expect(getTenantContext()).resolves.toBeNull();
  });
});
