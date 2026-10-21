import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyVscConnection, VSC_TENANT_ID } from "./brevo-vsc";
import type { TenantContext } from "@/types/domain";
const actor: TenantContext = { tenantId: VSC_TENANT_ID, tenant: { id: VSC_TENANT_ID, name: "VSC" }, userId: "user", role: "owner" };
const fetchMock = vi.fn();
beforeEach(() => { vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); vi.stubEnv("BREVO_VSC_API_KEY", "vsc-fixture"); vi.stubEnv("BREVO_API_KEY", "neos-fixture"); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("dedicated VSC connection", () => {
  it("rejects another tenant before any provider request", async () => {
    expect(await verifyVscConnection({ ...actor, tenantId: "neos" })).toBe("forbidden");
    expect(await verifyVscConnection(null)).toBe("forbidden");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("never uses the global NEOS credential as a fallback", async () => {
    vi.stubEnv("BREVO_VSC_API_KEY", "");
    expect(await verifyVscConnection(actor)).toBe("unconfigured");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("only reads account identity and never returns provider secrets", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ email: "contact@vendresoncommerce.com", marketingAutomation: { key: "secret" } }) });
    expect(await verifyVscConnection(actor)).toBe("connected");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith("https://api.brevo.com/v3/account", expect.objectContaining({ method: "GET", headers: { "api-key": "vsc-fixture", accept: "application/json" }, redirect: "error", cache: "no-store" }));
  });
  it("rejects a valid key for a different account", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ email: "other@example.test" }) });
    expect(await verifyVscConnection(actor)).toBe("wrong_account");
  });
  it("does not expose provider errors", async () => {
    fetchMock.mockRejectedValue(new Error("secret provider details"));
    expect(await verifyVscConnection(actor)).toBe("unavailable");
  });
});
