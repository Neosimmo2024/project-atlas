import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { context, manage, worker } = vi.hoisted(() => ({ context: vi.fn(), manage: vi.fn(), worker: vi.fn() }));
vi.mock("@/repositories/tenant-context", () => ({ getTenantContext: context }));
vi.mock("@/services/ovh-connection", () => ({ canManageOvh: manage }));
vi.mock("@/services/vsc-reply-worker", () => ({ reconcileVscRepliesOnce: worker }));
import { POST } from "@/app/api/admin/vsc-reply-sync/route";
const tenant = "20000000-0000-0000-0000-000000000001";
const request = (origin = "https://vsc.example.com") => new Request("https://vsc.example.com/api/admin/vsc-reply-sync", { method: "POST", headers: { origin }, body: JSON.stringify({ tenantId: "other-company" }) });
describe("VSC reply processing authorization", () => {
  beforeEach(() => {
    vi.resetAllMocks(); vi.stubEnv("VSC_OVH_TENANT_ID", tenant);
    context.mockResolvedValue({ tenantId: tenant }); manage.mockReturnValue(true);
    worker.mockResolvedValue({ inspected: 200, matched: 2, recorded: 1, hasMore: true });
  });
  afterEach(() => vi.unstubAllEnvs());
  it("rejects absent, null and foreign origins before accessing the database", async () => {
    for (const origin of ["", "null", "https://other.example.com"]) expect((await POST(request(origin))).status).toBe(403);
    expect(context).not.toHaveBeenCalled(); expect(worker).not.toHaveBeenCalled();
  });
  it("fails closed without configuration", async () => {
    vi.stubEnv("VSC_OVH_TENANT_ID", ""); expect((await POST(request())).status).toBe(503); expect(worker).not.toHaveBeenCalled();
  });
  it("refuses non-members and non-administrators", async () => {
    context.mockResolvedValueOnce(null); expect((await POST(request())).status).toBe(403);
    manage.mockReturnValue(false); expect((await POST(request())).status).toBe(403); expect(worker).not.toHaveBeenCalled();
  });
  it("processes exactly one bounded batch for the configured tenant, ignoring caller tenant input", async () => {
    const response = await POST(request()); expect(response.status).toBe(200);
    expect(context).toHaveBeenCalledWith(tenant); expect(worker).toHaveBeenCalledExactlyOnceWith(tenant);
    expect(await response.json()).toEqual({ inspected: 200, matched: 2, recorded: 1, hasMore: true });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("does not leak provider errors or retry automatically", async () => {
    worker.mockRejectedValue(new Error("private provider detail"));
    const response = await POST(request()); expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private provider detail"); expect(worker).toHaveBeenCalledTimes(1);
  });
});
