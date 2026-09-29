import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { diagnoseBrevoQaAccount as diagnose, brevoContactCommandAvailability } from "./brevo-account-diagnostic";
const m = vi.hoisted(() => ({ context: vi.fn(), fetch: vi.fn() }));
vi.mock("./tenant-context", () => ({ getTenantContext: m.context }));
const tenantId = "8e27b0ff-3f1a-41fa-8390-628c718723a2";
const actor = { tenantId, userId: "fixture-owner", role: "owner" };
beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal("fetch", m.fetch);
  for (const [name, value] of Object.entries({ VERCEL: "1", VERCEL_ENV: "preview",
    VERCEL_PROJECT_ID: "prj_V0z2DwPzzhgWJxuv7iEEHWMG2yon", NEXT_PUBLIC_SUPABASE_URL: "https://mahgxumwucxehsooijag.supabase.co",
    ATLAS_BREVO_CONTACT_TENANT_ID: tenantId, ATLAS_BREVO_ORGANIZATION_ID: "org_fixture", BREVO_API_KEY: "fixture-key",
    ATLAS_BREVO_CONTACT_CHECK_ENABLED: "1", ATLAS_BREVO_CONTACT_REVIEW_ENABLED: "1" })) vi.stubEnv(name, value);
  m.context.mockResolvedValue({ ...actor });
  m.fetch.mockResolvedValue(new Response(JSON.stringify({ email: "contact@neos-immo.com", organization_id: "org_fixture", marketingAutomation: { key: "private" } })));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("QA account diagnostic", () => {
  it.each(["VERCEL", "VERCEL_ENV", "VERCEL_PROJECT_ID", "NEXT_PUBLIC_SUPABASE_URL"])("rejects wrong %s without a provider call", async name => {
    vi.stubEnv(name, "other"); expect(await diagnose()).toEqual({ status: "scope_rejected" }); expect(m.fetch).not.toHaveBeenCalled();
    expect(brevoContactCommandAvailability()).toEqual({ checks: false, reviews: false });
  });
  it.each([null, { ...actor, role: "admin" }, { ...actor, tenantId: "other" }])("rejects unauthorized actor %j", async value => {
    m.context.mockResolvedValue(value); expect(await diagnose()).toEqual({ status: "forbidden" }); expect(m.fetch).not.toHaveBeenCalled();
  });
  it("returns only a matching organization and binding state", async () => {
    expect(await diagnose()).toEqual({ status: "account_identified", organizationId: "org_fixture", bindingMatches: true });
    expect(m.fetch).toHaveBeenCalledExactlyOnceWith("https://api.brevo.com/v3/account", expect.objectContaining({ method: "GET", cache: "no-store", redirect: "error", headers: { "api-key": "fixture-key", accept: "application/json" } }));
  });
  it("does not reveal another account", async () => {
    m.fetch.mockResolvedValue(new Response(JSON.stringify({ email: "other@example.com", organization_id: "private-org" })));
    expect(await diagnose()).toEqual({ status: "account_mismatch" });
  });
  it.each([null, { ...actor, role: "admin" }, { ...actor, tenantId: "other" }, { ...actor, userId: "other" }])("rechecks actor before disclosing identity %j", async value => {
    m.context.mockResolvedValueOnce(actor).mockResolvedValue(value); expect(await diagnose()).toEqual({ status: "forbidden" });
  });
  it("does not activate or pin an unconfigured binding", async () => {
    vi.stubEnv("ATLAS_BREVO_ORGANIZATION_ID", undefined);
    expect(await diagnose()).toEqual({ status: "account_identified", organizationId: "org_fixture", bindingMatches: false });
    expect(process.env.ATLAS_BREVO_ORGANIZATION_ID).toBeUndefined();
    expect(brevoContactCommandAvailability()).toEqual({ checks: false, reviews: false });
  });
  it.each([{}, [], { email: "contact@neos-immo.com", organization_id: 12 }, { email: "contact@neos-immo.com", organization_id: "invalid value" }])("fails closed on malformed response %j", async body => {
    m.fetch.mockResolvedValue(new Response(JSON.stringify(body))); expect(await diagnose()).toEqual({ status: "unavailable" });
  });
  it("redacts provider exceptions", async () => {
    m.fetch.mockRejectedValue(new Error("private")); expect(await diagnose()).toEqual({ status: "unavailable" });
  });
  it("requires independent command flags", () => {
    vi.stubEnv("ATLAS_BREVO_CONTACT_CHECK_ENABLED", undefined); expect(brevoContactCommandAvailability()).toEqual({ checks: false, reviews: false });
    vi.stubEnv("ATLAS_BREVO_CONTACT_CHECK_ENABLED", "1"); vi.stubEnv("ATLAS_BREVO_CONTACT_REVIEW_ENABLED", undefined);
    expect(brevoContactCommandAvailability()).toEqual({ checks: true, reviews: false });
  });
});
