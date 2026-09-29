import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inspectConfiguredBrevoContactAttempt as check } from "./brevo-configured-contact-check";
const m = vi.hoisted(() => ({ context: vi.fn(), verify: vi.fn(), inspect: vi.fn() }));
vi.mock("./tenant-context", () => ({ getTenantContext: m.context }));
vi.mock("@/services/brevo-account-binding", () => ({ verifyBrevoAccountBinding: m.verify }));
vi.mock("./brevo-contact-check", () => ({ inspectAndRecordBrevoContactAttempt: m.inspect }));
const tenantId = "11111111-1111-4111-8111-111111111111", id = "22222222-2222-4222-8222-222222222222";
const actor = { tenantId, userId: "33333333-3333-4333-8333-333333333333", role: "owner" };
beforeEach(() => {
  vi.resetAllMocks();
  for (const [name, value] of Object.entries({ ATLAS_BREVO_CONTACT_CHECK_ENABLED: "1", VERCEL: "1", VERCEL_ENV: "preview",
    VERCEL_PROJECT_ID: "prj_V0z2DwPzzhgWJxuv7iEEHWMG2yon", NEXT_PUBLIC_SUPABASE_URL: "https://mahgxumwucxehsooijag.supabase.co",
    ATLAS_BREVO_CONTACT_TENANT_ID: tenantId, ATLAS_BREVO_ORGANIZATION_ID: "org_fixture", BREVO_API_KEY: "fixture-key" })) vi.stubEnv(name, value);
  m.context.mockResolvedValue({ ...actor });
  m.verify.mockResolvedValue({ status: "verified" });
  m.inspect.mockResolvedValue({ status: "outcome_unresolved", recorded: true, checkId: id, retryAllowed: false });
});
afterEach(() => vi.unstubAllEnvs());
describe("configured contact checks", () => {
  it("stays disabled by default", async () => {
    vi.stubEnv("ATLAS_BREVO_CONTACT_CHECK_ENABLED", undefined);
    expect((await check(id)).status).toBe("disabled");
    expect(m.context).not.toHaveBeenCalled(); expect(m.verify).not.toHaveBeenCalled();
  });
  it.each(["VERCEL", "VERCEL_ENV", "VERCEL_PROJECT_ID", "NEXT_PUBLIC_SUPABASE_URL"])("blocks incorrect %s before access", async variable => {
    vi.stubEnv(variable, "other"); expect((await check(id)).status).toBe("scope_rejected");
    expect(m.context).not.toHaveBeenCalled(); expect(m.inspect).not.toHaveBeenCalled();
  });
  it("rejects invalid IDs", async () => {
    expect((await check("bad")).status).toBe("invalid_identity"); expect(m.context).not.toHaveBeenCalled();
  });
  it("requires a server tenant binding", async () => {
    vi.stubEnv("ATLAS_BREVO_CONTACT_TENANT_ID", undefined);
    expect((await check(id)).status).toBe("binding_unconfigured"); expect(m.verify).not.toHaveBeenCalled();
  });
  it.each([null, { ...actor, role: "reader" }, { ...actor, tenantId: id }])("blocks unauthorized actor %j", async value => {
    m.context.mockResolvedValue(value); expect((await check(id)).status).toBe("unauthorized_attempt");
    expect(m.verify).not.toHaveBeenCalled(); expect(m.inspect).not.toHaveBeenCalled();
  });
  it.each(["binding_unconfigured", "account_unverified", "account_mismatch"])("stops before contact access on %s", async status => {
    m.verify.mockResolvedValue({ status });
    expect(await check(id)).toEqual({ status, recorded: false, retryAllowed: false });
    expect(m.inspect).not.toHaveBeenCalled();
  });
  it.each([null, { ...actor, role: "reader" }, { ...actor, userId: id }, { ...actor, tenantId: id }])("rechecks the session after account lookup %j", async value => {
    m.context.mockResolvedValueOnce(actor).mockResolvedValue(value);
    expect((await check(id)).status).toBe("unauthorized_attempt"); expect(m.inspect).not.toHaveBeenCalled();
  });
  it("passes only captured server configuration and preserves the unresolved result", async () => {
    m.verify.mockImplementation(async () => { vi.stubEnv("BREVO_API_KEY", "rotated"); return { status: "verified" }; });
    expect(await check(id)).toEqual({ status: "outcome_unresolved", recorded: true, checkId: id, retryAllowed: false });
    expect(m.verify).toHaveBeenCalledWith(tenantId, { enabled: true, accountTenantId: tenantId, expectedOrganizationId: "org_fixture", apiKey: "fixture-key" });
    expect(m.inspect).toHaveBeenCalledWith(id, { enabled: true, accountTenantId: tenantId, apiKey: "fixture-key" });
  });
  it("redacts infrastructure errors", async () => {
    m.verify.mockRejectedValue(new Error("private"));
    expect(await check(id)).toEqual({ status: "verification_failed", recorded: false, retryAllowed: false });
    expect(m.inspect).not.toHaveBeenCalled();
  });
});
