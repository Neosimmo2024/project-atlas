import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), sync: vi.fn(), rpc: vi.fn() }));
vi.mock("@/services/recruitment-email-orchestrator", () => ({ isAuthorizedRecruitmentOrchestrator: mocks.auth }));
vi.mock("@/lib/supabase/service-role", () => ({ createSupabaseServiceRoleClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("../../../../../../../../scripts/calendly-sms-stop.mjs", () => ({ syncCalendlyStops: mocks.sync }));
import { POST } from "./route";
const request = () => new Request("https://example.test/api/internal/calendly/sync", { method: "POST" });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("VERCEL_PROJECT_ID", "prj_V0z2DwPzzhgWJxuv7iEEHWMG2yon");
  vi.stubEnv("VERCEL_GIT_COMMIT_REF", "agent/calendly-free-sms-stop-2026-09-30");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://mahgxumwucxehsooijag.supabase.co");
  mocks.auth.mockResolvedValue(true);
  mocks.rpc.mockImplementation(async (name: string) => ({ data: name.startsWith("claim") ? "lease-id" : true, error: null }));
  mocks.sync.mockResolvedValue({ mode: "apply", added: 1 });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("Calendly stop synchronization", () => {
  it.each(["VERCEL_ENV", "VERCEL_PROJECT_ID", "VERCEL_GIT_COMMIT_REF", "NEXT_PUBLIC_SUPABASE_URL"])("rejects wrong %s", async key => {
    vi.stubEnv(key, "wrong");
    expect((await POST(request())).status).toBe(404);
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects unauthorized requests before acquiring a lease", async () => {
    mocks.auth.mockResolvedValue(false);
    expect((await POST(request())).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("does no provider work when disabled or already leased", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    expect((await POST(request())).status).toBe(409);
    expect(mocks.sync).not.toHaveBeenCalled();
  });
  it("fails closed if claiming fails", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "private" } });
    expect((await POST(request())).status).toBe(503);
    expect(mocks.sync).not.toHaveBeenCalled();
  });
  it("journals success and limits writes to list 8 additions", async () => {
    expect((await POST(request())).status).toBe(200);
    const options = mocks.sync.mock.calls[0][0];
    expect(options.apply).toBe(true);
    expect(mocks.rpc).toHaveBeenLastCalledWith("finish_calendly_sms_stop_run", { p_id: "lease-id", p_success: true, p_summary: { mode: "apply", added: 1 } });
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await options.transport("https://api.brevo.com/v3/contacts/5?identifierType=contact_id", { method: "PUT", body: '{"listIds":[8]}' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    for (const body of ['{"listIds":[1]}', '{"smsBlacklisted":false}']) {
      expect(() => options.transport("https://api.brevo.com/v3/contacts/5?identifierType=contact_id", { method: "PUT", body })).toThrow();
    }
    expect(() => options.transport("https://api.brevo.com/v3/transactionalSMS/sms", { method: "POST", body: '{}' })).toThrow();
  });
  it("journals failures without returning private provider data", async () => {
    mocks.sync.mockRejectedValue(Error("private"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private");
    expect(mocks.rpc).toHaveBeenLastCalledWith("finish_calendly_sms_stop_run", { p_id: "lease-id", p_success: false });
  });
  it("does not report success if journaling fails", async () => {
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name.startsWith("claim") ? "lease-id" : false, error: null }));
    expect((await POST(request())).status).toBe(503);
  });
});
