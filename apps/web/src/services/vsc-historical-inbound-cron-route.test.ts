import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { sync } = vi.hoisted(() => ({ sync: vi.fn() }));
vi.mock("@/services/vsc-historical-inbound-worker", () => ({ reconcileVscHistoricalInboundOnce: sync }));
import { GET } from "@/app/api/cron/vsc-historical-inbound/route";
const tenant = "20000000-0000-0000-0000-000000000001";
const actor = "10000000-0000-0000-0000-000000000001";
const secret = "synthetic-cron-secret-for-local-tests-only";
const request = (authorization = `Bearer ${secret}`) => new Request("https://vsc.example.com/api/cron/vsc-historical-inbound?tenant=foreign&actor=forged&ids=999", { headers: { authorization } });
describe("VSC scheduled historical inbound entry point", () => {
  beforeEach(() => {
    vi.resetAllMocks(); vi.stubEnv("VSC_HISTORICAL_INBOUND_CRON_ENABLED", "true");
    vi.stubEnv("CRON_SECRET", secret); vi.stubEnv("VSC_OVH_TENANT_ID", tenant); vi.stubEnv("VSC_HISTORICAL_INBOUND_ACTOR_ID", actor);
    sync.mockResolvedValue({ inspected: 10, held: 1, cancelled: 2, exactThreadVerified: false, sendingEnabled: false });
  });
  afterEach(() => vi.unstubAllEnvs());
  it("remains disabled without the exact independent activation flag", async () => {
    for (const value of ["", "false", "TRUE", "1"]) {
      vi.stubEnv("VSC_HISTORICAL_INBOUND_CRON_ENABLED", value);
      expect((await GET(request())).status).toBe(503);
    }
    expect(sync).not.toHaveBeenCalled();
  });
  it("rejects missing, malformed, incorrect and oversized authorization before synchronization", async () => {
    for (const auth of ["", secret, "Bearer undefined", `Bearer ${secret}x`, "x".repeat(4097)])
      expect((await GET(request(auth))).status).toBe(401);
    for (const value of ["", "short"]) {
      vi.stubEnv("CRON_SECRET", value);
      expect((await GET(request(`Bearer ${value}`))).status).toBe(401);
    }
    expect(sync).not.toHaveBeenCalled();
  });
  it("requires the tenant and actor configured on the server", async () => {
    for (const name of ["VSC_OVH_TENANT_ID", "VSC_HISTORICAL_INBOUND_ACTOR_ID"]) {
      for (const value of ["", "forged"]) {
        vi.stubEnv(name, value);
        expect((await GET(request())).status).toBe(503);
      }
      vi.stubEnv(name, name === "VSC_OVH_TENANT_ID" ? tenant : actor);
    }
    expect(sync).not.toHaveBeenCalled();
  });
  it("ignores query identities and performs one bounded synchronization without sending", async () => {
    const r = await GET(request());
    expect(r.status).toBe(200); expect(r.headers.get("cache-control")).toBe("no-store");
    expect(await r.json()).toEqual({ inspected: 10, held: 1, cancelled: 2, exactThreadVerified: false, sendingEnabled: false });
    expect(sync).toHaveBeenCalledExactlyOnceWith(tenant, actor);
  });
  it("masks service failures and leaves retry to a later invocation", async () => {
    sync.mockRejectedValue(new Error("private provider credential"));
    const r = await GET(request()); expect(r.status).toBe(503);
    expect(await r.text()).not.toContain("private"); expect(sync).toHaveBeenCalledTimes(1);
  });
});
