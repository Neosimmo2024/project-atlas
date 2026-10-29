import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inspectVscBrevoSmsAccount } from "./vsc-brevo-sms-status";
const tenant = "20000000-0000-0000-0000-000000000001";
const fetchMock = vi.fn();
describe("VSC read-only Brevo SMS account check", () => {
  beforeEach(() => { vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); vi.stubEnv("VSC_OVH_TENANT_ID", tenant); vi.stubEnv("VSC_BREVO_API_KEY", "synthetic-vsc-test-key"); });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it("rejects absent, malformed and foreign tenants before provider access", async () => {
    for (const id of ["", "invalid", "20000000-0000-0000-0000-000000000002"]) await expect(inspectVscBrevoSmsAccount(id)).rejects.toThrow("non autorisée");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("does not fall back to the recruitment key", async () => {
    vi.stubEnv("VSC_BREVO_API_KEY", ""); vi.stubEnv("BREVO_API_KEY", "synthetic-recruitment-key");
    expect(await inspectVscBrevoSmsAccount(tenant)).toEqual({ state: "missing_key", dispatchEnabled: false }); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("uses only a bounded noncached account GET and returns no account details or key", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ email: " CONTACT@VENDRESONCOMMERCE.COM ", firstName: "private", plan: [{ credits: 999 }] }) });
    const result = await inspectVscBrevoSmsAccount(tenant);
    expect(result).toEqual({ state: "identity_verified", dispatchEnabled: false });
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("https://api.brevo.com/v3/account", expect.objectContaining({ method: "GET", cache: "no-store", redirect: "error", headers: { "api-key": "synthetic-vsc-test-key", accept: "application/json" }, signal: expect.any(AbortSignal) }));
    expect(JSON.stringify(result)).not.toContain("private"); expect(JSON.stringify(result)).not.toContain("key");
  });
  it("distinguishes another account without exposing its identity", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ email: "other@fixture.invalid" }) });
    expect(await inspectVscBrevoSmsAccount(tenant)).toEqual({ state: "identity_mismatch", dispatchEnabled: false });
  });
  it("treats absent identity, rejected credentials, invalid JSON and timeout as unavailable without retry", async () => {
    for (const response of [{ ok: false }, { ok: true, json: async () => ({}) }, { ok: true, json: async () => { throw new Error("private"); } }]) {
      fetchMock.mockResolvedValueOnce(response); expect((await inspectVscBrevoSmsAccount(tenant)).state).toBe("unavailable");
    }
    fetchMock.mockRejectedValueOnce(new Error("private timeout")); expect((await inspectVscBrevoSmsAccount(tenant)).state).toBe("unavailable");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
