import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/types/domain";
const smtp = vi.hoisted(() => ({ verify: vi.fn(), close: vi.fn(), create: vi.fn() }));
vi.mock("nodemailer", () => ({ default: { createTransport: smtp.create } }));
import { canManageIonos, ionosConnectionStatus, verifyIonosConnection } from "./ionos-connection";
const tenantId = "11111111-1111-4111-8111-111111111111";
const context = { tenantId, userId: "admin", role: "admin", tenant: { id: tenantId, name: "Les Formateurs Immo" } } as TenantContext;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("LFI_IONOS_TENANT_ID", tenantId);
  vi.stubEnv("LFI_IONOS_SMTP_PASSWORD", " secret-exact ");
  smtp.create.mockReturnValue({ verify: smtp.verify, close: smtp.close });
  smtp.verify.mockResolvedValue(true);
});
afterEach(() => vi.unstubAllEnvs());
describe("IONOS tenant-scoped diagnostic", () => {
  it("denies another tenant even with the same name and an admin role", async () => {
    const foreign = { ...context, tenantId: "22222222-2222-4222-8222-222222222222" };
    expect(ionosConnectionStatus(foreign)).toBeNull();
    expect((await verifyIonosConnection(foreign)).success).toBe(false);
    expect(smtp.create).not.toHaveBeenCalled();
  });
  it("rejects non-admins and absent or malformed tenant configuration", () => {
    expect(canManageIonos({ ...context, role: "reader" } as TenantContext)).toBe(false);
    for (const value of ["", "Les Formateurs Immo"]) {
      vi.stubEnv("LFI_IONOS_TENANT_ID", value);
      expect(canManageIonos(context)).toBe(false);
    }
  });
  it("does not connect when the secret is missing", async () => {
    vi.stubEnv("LFI_IONOS_SMTP_PASSWORD", "");
    expect(ionosConnectionStatus(context)).toMatchObject({ configured: false, campaignsEnabled: false });
    expect((await verifyIonosConnection(context)).success).toBe(false);
    expect(smtp.create).not.toHaveBeenCalled();
  });
  it("authenticates using fixed IONOS identity, preserves the secret, closes without sending", async () => {
    expect((await verifyIonosConnection(context)).success).toBe(true);
    expect(smtp.create).toHaveBeenCalledWith(expect.objectContaining({
      host: "smtp.ionos.fr", port: 465, secure: true,
      auth: { user: "contact@lesformateursimmo.com", pass: " secret-exact " },
      tls: expect.objectContaining({ minVersion: "TLSv1.2", rejectUnauthorized: true }),
      logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true
    }));
    expect(smtp.verify).toHaveBeenCalledOnce();
    expect(smtp.close).toHaveBeenCalledOnce();
    expect(JSON.stringify(ionosConnectionStatus(context))).not.toContain("secret-exact");
  });
  it.each(["EAUTH", "ETIMEDOUT"])("redacts %s error details and closes", async code => {
    smtp.verify.mockRejectedValue({ code, message: "secret-exact private SMTP dialogue" });
    const result = await verifyIonosConnection(context);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/secret-exact|private SMTP/);
    expect(smtp.close).toHaveBeenCalledOnce();
  });
});
