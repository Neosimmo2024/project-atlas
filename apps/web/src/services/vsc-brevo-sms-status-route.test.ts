import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { context, manage, inspect } = vi.hoisted(() => ({ context: vi.fn(), manage: vi.fn(), inspect: vi.fn() }));
vi.mock("@/repositories/tenant-context", () => ({ getTenantContext: context }));
vi.mock("@/services/ovh-connection", () => ({ canManageOvh: manage }));
vi.mock("@/services/vsc-brevo-sms-status", () => ({ inspectVscBrevoSmsAccount: inspect }));
import { GET } from "@/app/api/admin/vsc-brevo-sms-status/route";
const tenant = "20000000-0000-0000-0000-000000000001";
describe("VSC account diagnostic authorization", () => {
  beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("VSC_OVH_TENANT_ID", tenant); context.mockResolvedValue({ tenantId: tenant }); manage.mockReturnValue(true); inspect.mockResolvedValue({ state: "missing_key", dispatchEnabled: false }); });
  afterEach(() => vi.unstubAllEnvs());
  it("refuses missing configuration, session or administrator role", async () => {
    context.mockResolvedValueOnce(null); expect((await GET()).status).toBe(403);
    manage.mockReturnValue(false); expect((await GET()).status).toBe(403);
    vi.stubEnv("VSC_OVH_TENANT_ID", ""); expect((await GET()).status).toBe(403); expect(inspect).not.toHaveBeenCalled();
  });
  it("checks only the authorized VSC tenant with no cache", async () => {
    const result = await GET(); expect(result.status).toBe(200); expect(result.headers.get("cache-control")).toBe("no-store");
    expect(inspect).toHaveBeenCalledExactlyOnceWith(tenant); expect(await result.json()).toEqual({ state: "missing_key", dispatchEnabled: false });
  });
  it("masks provider and authorization failures", async () => {
    context.mockRejectedValue(new Error("private")); const response = await GET(); expect(response.status).toBe(503); expect(await response.text()).not.toContain("private");
  });
});
