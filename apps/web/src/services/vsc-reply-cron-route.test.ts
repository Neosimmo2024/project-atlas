import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { worker } = vi.hoisted(() => ({ worker: vi.fn() }));
vi.mock("@/services/vsc-reply-worker", () => ({ reconcileVscRepliesOnce: worker }));
import { GET } from "@/app/api/cron/vsc-replies/route";
const tenant = "20000000-0000-0000-0000-000000000001";
const secret = "synthetic-cron-secret-for-local-tests-only";
const request = (authorization = `Bearer ${secret}`) => new Request("https://vsc.example.com/api/cron/vsc-replies?tenantId=other", { headers: { authorization } });
describe("VSC scheduled reply entry point", () => {
  beforeEach(() => {
    vi.resetAllMocks(); vi.stubEnv("VSC_REPLY_CRON_ENABLED", "true");
    vi.stubEnv("CRON_SECRET", secret); vi.stubEnv("VSC_OVH_TENANT_ID", tenant);
    worker.mockResolvedValue({ inspected: 200, matched: 1, recorded: 1, hasMore: true });
  });
  afterEach(() => vi.unstubAllEnvs());
  it("stays disabled by default and for approximate flag values", async () => {
    for (const flag of ["", "false", "TRUE", "1"]) {
      vi.stubEnv("VSC_REPLY_CRON_ENABLED", flag);
      expect((await GET(request())).status).toBe(503);
    }
    expect(worker).not.toHaveBeenCalled();
  });
  it("rejects missing, wrong, malformed and oversized credentials", async () => {
    for (const auth of ["", "Bearer undefined", secret, `Bearer ${secret}extra`, "x".repeat(4097)])
      expect((await GET(request(auth))).status).toBe(401);
    for (const value of ["", "short"]) {
      vi.stubEnv("CRON_SECRET", value);
      expect((await GET(request(`Bearer ${value}`))).status).toBe(401);
    }
    expect(worker).not.toHaveBeenCalled();
  });
  it("requires a configured tenant", async () => {
    for (const value of ["", "other-company"]) {
      vi.stubEnv("VSC_OVH_TENANT_ID", value);
      expect((await GET(request())).status).toBe(503);
    }
    expect(worker).not.toHaveBeenCalled();
  });
  it("runs one bounded batch for the server tenant without looping on hasMore", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ inspected: 200, matched: 1, recorded: 1, hasMore: true });
    expect(worker).toHaveBeenCalledExactlyOnceWith(tenant);
  });
  it("sanitizes errors and leaves retry to a later invocation", async () => {
    worker.mockRejectedValue(new Error("private IMAP credential"));
    const response = await GET(request()); expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private"); expect(worker).toHaveBeenCalledTimes(1);
  });
});
