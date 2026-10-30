import { beforeEach, describe, expect, it, vi } from "vitest";
const { read, from, eq, inside, gt } = vi.hoisted(() => ({ read: vi.fn(), from: vi.fn(), eq: vi.fn(), inside: vi.fn(), gt: vi.fn() }));
vi.mock("@/lib/supabase/service-role", () => ({ createSupabaseServiceRoleClient: () => ({ from }) }));
import { matchVscReplyBatch } from "./vsc-reply-reconciliation";
const envelope = { messageId: "<reply@example.com>", from: "shop@example.com", inReplyTo: "<sent@example.com>", references: [], receivedAt: "2026-10-28T09:00:00Z" };
const row = { id: "001", tenant_id: "vsc", campaign_id: "campaign", person_id: "person", provider_message_id: "<sent@example.com>", people: { primary_email: "shop@example.com" } };
describe("VSC exact outbound lookup", () => {
  beforeEach(() => {
    vi.resetAllMocks(); process.env.VSC_OVH_TENANT_ID = "vsc";
    const q = { select: vi.fn(), eq, in: inside, order: vi.fn(), limit: vi.fn(), gt, then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => read().then(resolve, reject) };
    for (const fn of [q.select, eq, inside, q.order, q.limit, gt]) fn.mockReturnValue(q);
    from.mockReturnValue(q); read.mockResolvedValue({ data: [row], error: null });
  });
  it("finds replies beyond the first 500 sent deliveries", async () => {
    read.mockResolvedValueOnce({ data: Array.from({ length: 500 }, (_, i) => ({ ...row, id: String(i), people: { primary_email: "other@example.com" } })), error: null });
    expect(await matchVscReplyBatch("vsc", [envelope])).toHaveLength(1);
    expect(read).toHaveBeenCalledTimes(2); expect(gt).toHaveBeenCalledWith("id", "499");
    expect(eq).toHaveBeenCalledWith("tenant_id", "vsc"); expect(inside).toHaveBeenCalledWith("provider_message_id", ["<sent@example.com>"]);
  });
  it("does not scan history when there are no thread IDs", async () => {
    expect(await matchVscReplyBatch("vsc", [])).toEqual([]); expect(from).not.toHaveBeenCalled();
  });
  it("propagates DB errors so a worker cannot advance its checkpoint", async () => {
    read.mockResolvedValue({ data: null, error: new Error("lookup failed") });
    await expect(matchVscReplyBatch("vsc", [envelope])).rejects.toThrow("lookup failed");
  });
  it("rejects another tenant before loading data", async () => {
    await expect(matchVscReplyBatch("neos", [envelope])).rejects.toThrow(); expect(from).not.toHaveBeenCalled();
  });
});
