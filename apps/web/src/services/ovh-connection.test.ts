import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/types/domain";
const smtp = vi.hoisted(() => ({ verify: vi.fn(), close: vi.fn(), create: vi.fn() }));
vi.mock("nodemailer", () => ({ default: { createTransport: smtp.create } }));
import { canManageOvh, ovhConnectionStatus, verifyOvhConnection } from "./ovh-connection";
const tenantId = "11111111-1111-4111-8111-111111111111";
const context = { tenantId, userId: "admin", role: "admin", tenant: { id: tenantId, name: "VendreSonCommerce" } } as TenantContext;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VSC_OVH_TENANT_ID", tenantId);
  vi.stubEnv("VSC_OVH_SMTP_PASSWORD", " secret-exact ");
  smtp.create.mockReturnValue({ verify: smtp.verify, close: smtp.close });
  smtp.verify.mockResolvedValue(true);
});
afterEach(() => vi.unstubAllEnvs());
describe("OVH tenant-scoped diagnostic", () => {
  it("denies another tenant even with the same name and an admin role", async () => {
    const foreign = { ...context, tenantId: "22222222-2222-4222-8222-222222222222" };
    expect(ovhConnectionStatus(foreign)).toBeNull();
    expect((await verifyOvhConnection(foreign)).success).toBe(false);
    expect(smtp.create).not.toHaveBeenCalled();
  });
  it("rejects non-admins and absent or malformed tenant configuration", () => {
    expect(canManageOvh({ ...context, role: "reader" } as TenantContext)).toBe(false);
    for (const value of ["", "VendreSonCommerce"]) {
      vi.stubEnv("VSC_OVH_TENANT_ID", value);
      expect(canManageOvh(context)).toBe(false);
    }
  });
  it("does not connect when the secret is missing", async () => {
    vi.stubEnv("VSC_OVH_SMTP_PASSWORD", "");
    expect(ovhConnectionStatus(context)).toMatchObject({ configured: false, campaignsEnabled: false });
    expect((await verifyOvhConnection(context)).success).toBe(false);
    expect(smtp.create).not.toHaveBeenCalled();
  });
  it("authenticates using fixed OVH identity, preserves the secret, closes without sending", async () => {
    expect((await verifyOvhConnection(context)).success).toBe(true);
    expect(smtp.create).toHaveBeenCalledWith(expect.objectContaining({
      host: "ssl0.ovh.net", port: 465, secure: true,
      auth: { user: "contact@vendresoncommerce.com", pass: " secret-exact " },
      tls: expect.objectContaining({ minVersion: "TLSv1.2", rejectUnauthorized: true }),
      logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true
    }));
    expect(smtp.verify).toHaveBeenCalledOnce();
    expect(smtp.close).toHaveBeenCalledOnce();
    expect(JSON.stringify(ovhConnectionStatus(context))).not.toContain("secret-exact");
  });
  it.each(["EAUTH", "ETIMEDOUT"])("redacts %s error details and closes", async code => {
    smtp.verify.mockRejectedValue({ code, message: "secret-exact private SMTP dialogue" });
    const result = await verifyOvhConnection(context);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/secret-exact|private SMTP/);
    expect(smtp.close).toHaveBeenCalledOnce();
  });
});
