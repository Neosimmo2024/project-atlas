import { describe, expect, it, vi } from "vitest";
import { verifyBrevoAccountBinding as verify } from "./brevo-account-binding";
const tenant = "11111111-1111-4111-8111-111111111111";
function fixture(body: unknown = { organization_id: "org_fixture", email: "private@example.test", marketingAutomation: { key: "private" } }, status = 200) {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  return { transport, options: { enabled: true, accountTenantId: tenant, expectedOrganizationId: "org_fixture", apiKey: " mock-secret ", transport } };
}
describe("Brevo account binding", () => {
  it("defaults to disabled without a request", async () => {
    const { options, transport } = fixture();
    expect(await verify(tenant, { ...options, enabled: undefined })).toEqual({ status: "disabled" });
    expect(transport).not.toHaveBeenCalled();
  });
  it.each(["invalid", "22222222-2222-4222-8222-222222222222"])("blocks tenant %s before network", async tenantId => {
    const { options, transport } = fixture();
    expect(await verify(tenantId, options)).toEqual({ status: "tenant_mismatch" });
    expect(transport).not.toHaveBeenCalled();
  });
  it.each([{ expectedOrganizationId: "" }, { expectedOrganizationId: " org_fixture" }, { apiKey: " " }])("blocks missing configuration %j", async change => {
    const { options, transport } = fixture();
    expect(await verify(tenant, { ...options, ...change })).toEqual({ status: "binding_unconfigured" });
    expect(transport).not.toHaveBeenCalled();
  });
  it("verifies exact organization with GET only, no redirect/cache or response disclosure", async () => {
    const { options, transport } = fixture();
    expect(await verify(tenant, options)).toEqual({ status: "verified" });
    expect(transport).toHaveBeenCalledWith("https://api.brevo.com/v3/account", {
      method: "GET", headers: { "api-key": "mock-secret", accept: "application/json" },
      redirect: "error", cache: "no-store", signal: expect.any(AbortSignal),
    });
  });
  it.each([null, [], {}, { organization_id: 42 }, { organization_id: "" }, { organization_id: "org_fixture " }])("rejects malformed account %j", async body => {
    expect(await verify(tenant, fixture(body).options)).toEqual({ status: "account_unverified" });
  });
  it("never accepts email or company name instead of the organization", async () => {
    expect(await verify(tenant, fixture({ organization_id: "other", email: "org_fixture", companyName: "org_fixture" }).options)).toEqual({ status: "account_mismatch" });
  });
  it.each([301, 401, 403, 429, 500])("rejects HTTP %s even with matching response", async status => {
    expect(await verify(tenant, fixture({ organization_id: "org_fixture" }, status).options)).toEqual({ status: "account_unverified" });
  });
  it("does not cache a successful verification", async () => {
    const { options, transport } = fixture();
    await verify(tenant, options);
    transport.mockResolvedValueOnce(new Response(JSON.stringify({ organization_id: "other" })));
    expect(await verify(tenant, options)).toEqual({ status: "account_mismatch" });
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it("redacts network and parsing failures", async () => {
    const { options, transport } = fixture();
    transport.mockRejectedValueOnce(new Error("private-key"));
    expect(await verify(tenant, options)).toEqual({ status: "account_unverified" });
    transport.mockResolvedValueOnce(new Response("invalid JSON"));
    expect(await verify(tenant, options)).toEqual({ status: "account_unverified" });
  });
});
