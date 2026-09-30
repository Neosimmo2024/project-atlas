import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), sync: vi.fn() }));
vi.mock("@/services/recruitment-email-orchestrator", () => ({ isAuthorizedRecruitmentOrchestrator: mocks.auth }));
vi.mock("../../../../../../../../scripts/calendly-sms-stop.mjs", () => ({ syncCalendlyStops: mocks.sync }));
import { POST } from "./route";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("VERCEL_PROJECT_ID", "prj_V0z2DwPzzhgWJxuv7iEEHWMG2yon");
  vi.stubEnv("VERCEL_GIT_COMMIT_REF", "agent/calendly-free-sms-stop-2026-09-30");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://mahgxumwucxehsooijag.supabase.co");
  mocks.auth.mockResolvedValue(true);
  mocks.sync.mockResolvedValue({ mode: "dry-run", added: 0 });
});
afterEach(() => vi.unstubAllEnvs());
const request = () => new Request("https://example.test/api/internal/calendly/check", { method: "POST" });
describe("Calendly preview verification boundary", () => {
  it.each(["VERCEL_ENV", "VERCEL_PROJECT_ID", "VERCEL_GIT_COMMIT_REF", "NEXT_PUBLIC_SUPABASE_URL"])("rejects wrong %s before accessing providers", async key => {
    vi.stubEnv(key, "wrong");
    expect((await POST(request())).status).toBe(404);
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.sync).not.toHaveBeenCalled();
  });
  it("rejects an unauthorized scheduler", async () => {
    mocks.auth.mockResolvedValue(false);
    expect((await POST(request())).status).toBe(401);
    expect(mocks.sync).not.toHaveBeenCalled();
  });
  it("cannot activate writes from environment or request", async () => {
    vi.stubEnv("AVENOR_CALENDLY_STOP_APPLY", "true");
    const response = await POST(new Request("https://example.test", { method: "POST", body: '{"apply":true}' }));
    expect(response.status).toBe(200);
    expect(mocks.sync.mock.calls[0][0].apply).toBe(false);
    const transport = mocks.sync.mock.calls[0][0].transport;
    expect(() => transport("https://example.test", { method: "PUT" })).toThrow();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("never returns provider secrets or internal errors", async () => {
    mocks.sync.mockRejectedValue(new Error("private provider data"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private");
  });
});
