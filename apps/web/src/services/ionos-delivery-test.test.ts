import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/types/domain";
const mocks = vi.hoisted(() => ({ insert: vi.fn(), update: vi.fn(), eq: vi.fn(), sendMail: vi.fn(), close: vi.fn(), transport: vi.fn(), db: vi.fn() }));
vi.mock("@/lib/supabase/service-role", () => ({ createSupabaseServiceRoleClient: mocks.db }));
vi.mock("./ionos-connection", async original => ({ ...await original<typeof import("./ionos-connection")>(), createIonosTransport: mocks.transport }));
import { sendIonosDeliveryTest, TEST_RECIPIENT } from "./ionos-delivery-test";
const tenantId = "11111111-1111-4111-8111-111111111111";
const context = { tenantId, userId: "admin", role: "owner" } as TenantContext;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("LFI_IONOS_TENANT_ID", tenantId);
  vi.stubEnv("LFI_IONOS_SMTP_PASSWORD", " secret ");
  mocks.db.mockReturnValue({ from: () => ({ insert: mocks.insert, update: mocks.update }) });
  mocks.insert.mockResolvedValue({ error: null });
  mocks.update.mockReturnValue({ eq: () => ({ eq: mocks.eq }) });
  mocks.eq.mockResolvedValue({ error: null });
  mocks.transport.mockReturnValue({ sendMail: mocks.sendMail, close: mocks.close });
  mocks.sendMail.mockResolvedValue({ accepted: [TEST_RECIPIENT] });
});
afterEach(() => vi.unstubAllEnvs());
describe("IONOS delivery test", () => {
  it("denies other tenants before touching the journal or SMTP", async () => {
    expect((await sendIonosDeliveryTest({ ...context, tenantId: "other" })).success).toBe(false);
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("reserves before submitting one fixed message and reports acceptance, not delivery", async () => {
    const result = await sendIonosDeliveryTest(context);
    expect(result.success).toBe(true);
    expect(mocks.insert.mock.invocationCallOrder[0]).toBeLessThan(mocks.sendMail.mock.invocationCallOrder[0]);
    expect(mocks.sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: TEST_RECIPIENT, replyTo: "contact@lesformateursimmo.com" }));
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ status: "accepted" }));
    expect(mocks.close).toHaveBeenCalledOnce();
  });
  it.each(["23505", "database unavailable"])("never sends if the durable claim fails: %s", async code => {
    mocks.insert.mockResolvedValue({ error: { code } });
    expect((await sendIonosDeliveryTest(context)).success).toBe(false);
    expect(mocks.transport).not.toHaveBeenCalled();
  });
  it("retains an uncertain claim on timeout, redacts details, and never retries", async () => {
    mocks.sendMail.mockRejectedValue(new Error("private credentials"));
    const result = await sendIonosDeliveryTest(context);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).not.toContain("private credentials");
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ status: "uncertain" }));
    expect(mocks.sendMail).toHaveBeenCalledOnce();
    expect(mocks.close).toHaveBeenCalledOnce();
  });
  it("does not report success if the journal cannot be finalized", async () => {
    mocks.eq.mockResolvedValue({ error: { code: "failure" } });
    expect((await sendIonosDeliveryTest(context)).success).toBe(false);
    expect(mocks.sendMail).toHaveBeenCalledOnce();
  });
});
