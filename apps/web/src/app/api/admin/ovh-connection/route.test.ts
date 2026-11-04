import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ context: vi.fn(), verify: vi.fn() }));
vi.mock("@/repositories/tenant-context", () => ({ getTenantContext: mocks.context }));
vi.mock("@/services/ovh-connection", async importOriginal => ({
  ...await importOriginal<typeof import("@/services/ovh-connection")>(), verifyOvhConnection: mocks.verify
}));
import { POST } from "./route";
const tenantId = "11111111-1111-4111-8111-111111111111";
function request(origin: string | null = "https://atlas.example") {
  return new Request("https://atlas.example/api/admin/ovh-connection", { method: "POST", headers: origin ? { origin } : {} });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VSC_OVH_TENANT_ID", tenantId);
  mocks.context.mockResolvedValue({ tenantId, role: "owner" });
  mocks.verify.mockResolvedValue({ success: true, message: "ok" });
});
afterEach(() => vi.unstubAllEnvs());
describe("OVH diagnostic API", () => {
  it.each([null, "https://attacker.example"])("rejects origin %s before authentication/SMTP", async origin => {
    expect((await POST(request(origin))).status).toBe(403);
    expect(mocks.context).not.toHaveBeenCalled();
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it("requires authentication", async () => {
    mocks.context.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401);
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it.each([{ tenantId: "another-tenant", role: "owner" }, { tenantId, role: "reader" }])("rejects unauthorized context %j", async context => {
    mocks.context.mockResolvedValue(context);
    expect((await POST(request())).status).toBe(403);
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it("returns an uncached diagnostic to the authorized tenant admin", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.context).toHaveBeenCalledWith(tenantId);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ success: true, message: "ok" });
    expect(mocks.verify).toHaveBeenCalledOnce();
  });
  it("redacts unexpected internal exceptions", async () => {
    mocks.context.mockRejectedValue(new Error("private credential"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private credential");
  });
});
