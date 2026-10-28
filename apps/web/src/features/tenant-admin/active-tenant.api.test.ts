import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/active-tenant/route";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: mocks.getUser }, from: mocks.from }) }));
const tenantId = "f716f14d-7fc8-4e33-a49a-18c6a2367816";
const request = () => new Request("https://atlas.example/api/active-tenant", { method: "POST", body: JSON.stringify({ tenantId }) });

describe("active tenant authorization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-a" } } });
    mocks.from.mockReturnValue(mocks);
    mocks.select.mockReturnValue(mocks);
    mocks.eq.mockReturnValue(mocks);
  });
  it("rejects signed-out callers without querying memberships", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect((await POST(request())).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("does not set a tenant cookie for absent or revoked membership", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "user-a");
    expect(mocks.eq).toHaveBeenCalledWith("status", "active");
  });
  it("sets an HttpOnly cookie only for the verified membership", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { tenant_id: tenantId }, error: null });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.eq).toHaveBeenCalledWith("tenant_id", tenantId);
    expect(response.headers.get("set-cookie")).toContain(`atlas_active_tenant=${tenantId}`);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });
  it("fails closed on database errors", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: "unavailable" } });
    expect((await POST(request())).status).toBe(403);
  });
});
