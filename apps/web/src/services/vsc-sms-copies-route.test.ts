import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { context, manage, save, list } = vi.hoisted(() => ({ context: vi.fn(), manage: vi.fn(), save: vi.fn(), list: vi.fn() }));
vi.mock("@/repositories/tenant-context", () => ({ getTenantContext: context }));
vi.mock("@/services/ovh-connection", () => ({ canManageOvh: manage }));
vi.mock("@/services/vsc-sms-copy-drafts", () => ({ saveVscSmsCopy: save, listVscSmsCopies: list, VscSmsCopyInputError: class extends Error {} }));
import { GET, POST } from "@/app/api/admin/vsc-sms-copies/route";
const tenant = "20000000-0000-0000-0000-000000000001";
const request = (body = "{}", origin = "https://vsc.example.com", type = "application/json") => new Request("https://vsc.example.com/api/admin/vsc-sms-copies", { method: "POST", headers: { origin, "content-type": type }, body });
describe("VSC SMS copy route authorization", () => {
  beforeEach(() => {
    vi.resetAllMocks(); vi.stubEnv("VSC_OVH_TENANT_ID", tenant); context.mockResolvedValue({ tenantId: tenant }); manage.mockReturnValue(true);
    save.mockResolvedValue({ id: "copy" }); list.mockResolvedValue({ drafts: [], truncated: false });
  });
  afterEach(() => vi.unstubAllEnvs());
  it("rejects absent and foreign origins before authorization or writes", async () => {
    for (const origin of ["", "null", "https://other.example.com"]) expect((await POST(request("{}", origin))).status).toBe(403);
    expect(context).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
  });
  it("requires configured VSC administrator membership for reads and writes", async () => {
    manage.mockReturnValue(false); expect((await GET()).status).toBe(403); expect((await POST(request())).status).toBe(403);
    context.mockResolvedValue(null); expect((await GET()).status).toBe(403);
    vi.stubEnv("VSC_OVH_TENANT_ID", ""); expect((await POST(request())).status).toBe(403);
    expect(save).not.toHaveBeenCalled(); expect(list).not.toHaveBeenCalled();
  });
  it("rejects malformed, excessive and non-JSON bodies", async () => {
    expect((await POST(request("bad"))).status).toBe(400);
    expect((await POST(request("x".repeat(20001)))).status).toBe(413);
    expect((await POST(request("{}", undefined, "text/plain"))).status).toBe(415);
    expect(save).not.toHaveBeenCalled();
  });
  it("passes only the configured tenant to the service and disables caching", async () => {
    const response = await POST(request(JSON.stringify({ tenantId: "other", id: "copy" })));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(save).toHaveBeenCalledWith(tenant, { tenantId: "other", id: "copy" });
    expect((await GET()).status).toBe(200); expect(list).toHaveBeenCalledWith(tenant);
  });
  it("masks errors and never retries an ambiguous write automatically", async () => {
    save.mockRejectedValue(new Error("private detail")); const response = await POST(request());
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("private"); expect(save).toHaveBeenCalledTimes(1);
  });
});
