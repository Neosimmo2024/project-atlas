import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { context, manage, workspace, preview, save } = vi.hoisted(() => ({ context: vi.fn(), manage: vi.fn(), workspace: vi.fn(), preview: vi.fn(), save: vi.fn() }));
vi.mock("@/repositories/tenant-context", () => ({ getTenantContext: context }));
vi.mock("@/services/ovh-connection", () => ({ canManageOvh: manage }));
vi.mock("@/services/vsc-draft-workspace", () => ({ getVscDraftWorkspace: workspace, previewVscEmailDraft: preview, saveVscEmailDraft: save, VscDraftInputError: class extends Error {} }));
import { GET, POST } from "@/app/api/admin/vsc-drafts/route";
const tenant = "20000000-0000-0000-0000-000000000001";
const request = (body: string, origin = "https://vsc.example.com", type = "application/json") => new Request("https://vsc.example.com/api/admin/vsc-drafts", { method: "POST", headers: { origin, "content-type": type }, body });
describe("VSC drafts API authorization", () => {
  beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("VSC_OVH_TENANT_ID", tenant); context.mockResolvedValue({ tenantId: tenant }); manage.mockReturnValue(true); preview.mockResolvedValue({ sendingEnabled: false }); workspace.mockResolvedValue({ contacts: [] }); });
  afterEach(() => vi.unstubAllEnvs());
  it("rejects foreign, missing and null origins before any database access", async () => {
    for (const origin of ["", "null", "https://other.example.com"]) expect((await POST(request("{}", origin))).status).toBe(403);
    expect(context).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
  });
  it("requires an authorized VSC administrator for reads and writes", async () => {
    context.mockResolvedValue(null); expect((await GET()).status).toBe(403);
    context.mockResolvedValue({ tenantId: tenant }); manage.mockReturnValue(false); expect((await POST(request('{}'))).status).toBe(403);
    expect(workspace).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
  });
  it("rejects malformed, oversized and unsupported payloads", async () => {
    expect((await POST(request("{"))).status).toBe(400); expect((await POST(request("null"))).status).toBe(400);
    expect((await POST(request("x".repeat(20001)))).status).toBe(413); expect((await POST(request("{}", undefined, "text/plain"))).status).toBe(415);
    expect((await POST(request('{"action":"send"}'))).status).toBe(400); expect(save).not.toHaveBeenCalled();
  });
  it("ignores caller tenant and never enables sending", async () => {
    const response = await POST(request(JSON.stringify({ action: "preview", tenantId: "foreign", draft: { name: "Fixture" } })));
    expect(response.status).toBe(200); expect(preview).toHaveBeenCalledWith(tenant, { name: "Fixture" }); expect(response.headers.get("cache-control")).toBe("no-store"); expect(save).not.toHaveBeenCalled();
  });
  it("saves only through the distinct reviewed-draft action", async () => {
    save.mockResolvedValue({ submitted: 2 }); await POST(request(JSON.stringify({ action: "save", draft: { name: "Fixture" }, reviewKey: "review" })));
    expect(save).toHaveBeenCalledWith(tenant, { name: "Fixture" }, "review");
  });
});
