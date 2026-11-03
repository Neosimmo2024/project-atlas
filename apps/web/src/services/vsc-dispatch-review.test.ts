import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { client, query } = vi.hoisted(() => {
  const query = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), order: vi.fn(), limit: vi.fn() };
  return { client: vi.fn(), query };
});
vi.mock("@/lib/supabase/service-role", () => ({ createSupabaseServiceRoleClient: client }));
import { getVscDispatchReview } from "./vsc-dispatch-review";
const tenant = "20000000-0000-0000-0000-000000000001";
const row = { id: "30000000-0000-0000-0000-000000000001", campaign_id: "campaign", person_id: "person", dispatch_started_at: "2026-10-29T08:00:00Z", dispatch_outcome: "unknown" };
describe("VSC read-only dispatch investigation", () => {
  beforeEach(() => {
    vi.resetAllMocks(); vi.stubEnv("VSC_OVH_TENANT_ID", tenant);
    client.mockReturnValue({ from: vi.fn().mockReturnValue(query) });
    for (const method of [query.select, query.eq, query.in, query.order]) method.mockReturnValue(query);
    query.limit.mockResolvedValue({ data: [], error: null });
  });
  afterEach(() => vi.unstubAllEnvs());
  it("rejects foreign, absent and malformed tenants before creating a privileged client", async () => {
    for (const value of ["", "invalid", "20000000-0000-0000-0000-000000000002"])
      await expect(getVscDispatchReview(value)).rejects.toThrow("non autorisée");
    expect(client).not.toHaveBeenCalled();
  });
  it("restricts the read to VSC claimed email attempts whose result is sending or unknown", async () => {
    expect(await getVscDispatchReview(tenant)).toEqual({ rows: [], truncated: false });
    expect(query.eq.mock.calls).toEqual([["tenant_id", tenant], ["channel", "email"], ["status", "claimed"]]);
    expect(query.in).toHaveBeenCalledWith("dispatch_outcome", ["sending", "unknown"]);
    expect(query.select).toHaveBeenCalledWith("id,campaign_id,person_id,dispatch_started_at,dispatch_outcome");
    expect(query.limit).toHaveBeenCalledWith(51);
  });
  it("returns only investigation identifiers and never reservation secrets or content", async () => {
    query.limit.mockResolvedValue({ data: [{ ...row, claim_token: "private-token", dispatch_payload: { recipient: "private@example.com" } }], error: null });
    const result = await getVscDispatchReview(tenant);
    expect(result.rows[0]).toEqual({ deliveryId: row.id, campaignId: "campaign", personId: "person", startedAt: row.dispatch_started_at, outcome: "unknown", messageId: `<vsc-${row.id}@vendresoncommerce.com>` });
    expect(JSON.stringify(result)).not.toContain("private");
  });
  it("includes unfinished sending attempts and reports a bounded partial list", async () => {
    query.limit.mockResolvedValue({ data: Array.from({ length: 51 }, () => ({ ...row, dispatch_outcome: "sending", dispatch_started_at: null })), error: null });
    const result = await getVscDispatchReview(tenant);
    expect(result.rows).toHaveLength(50); expect(result.truncated).toBe(true);
    expect(result.rows[0].outcome).toBe("sending"); expect(result.rows[0].startedAt).toBeNull();
  });
  it("does not present database failure as an empty queue or expose raw errors", async () => {
    query.limit.mockResolvedValue({ data: null, error: { message: "private provider detail" } });
    await expect(getVscDispatchReview(tenant)).rejects.toThrow("temporairement indisponible");
    expect(query.limit).toHaveBeenCalledTimes(1);
  });
});
