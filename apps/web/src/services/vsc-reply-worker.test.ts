import { beforeEach, describe, expect, it, vi } from "vitest";
const { match, record, load, save, inbox } = vi.hoisted(() => ({ match: vi.fn(), record: vi.fn(), load: vi.fn(), save: vi.fn(), inbox: vi.fn() }));
vi.mock("@/services/vsc-reply-reconciliation", () => ({ matchVscReplyBatch: match }));
vi.mock("@/services/vsc-inbound-reply-journal", () => ({ recordVerifiedVscReply: record }));
vi.mock("@/services/vsc-imap-cursor", () => ({ loadVscImapCursor: load, saveVscImapCursor: save }));
vi.mock("@/services/vsc-ovh-imap", () => ({ inspectVscInboxBatch: inbox }));
import { reconcileVscRepliesOnce } from "./vsc-reply-worker";
const candidate = {
  tenantId: "vsc", campaignId: "campaign", personId: "person",
  inboundMessageId: "<reply@example.com>", originalOutboundMessageId: "<sent@example.com>",
  inboundFrom: "shop@example.com", expectedEmail: "shop@example.com",
  isReplyToCampaign: true, receivedAt: "2026-10-28T09:00:00Z"
};
const cursor = { uidValidity: "42", lastUid: 0, version: 0 };
const batch = { uidValidity: "42", lastUid: 200, scanned: 4, envelopes: [], hasMore: true };
describe("VSC incremental reply worker", () => {
  beforeEach(() => {
    vi.resetAllMocks(); process.env.VSC_OVH_TENANT_ID = "vsc";
    load.mockResolvedValue(cursor); inbox.mockResolvedValue(batch);
    match.mockResolvedValue([candidate]); record.mockResolvedValue({ recorded: true }); save.mockResolvedValue(undefined);
  });
  it("refuses another tenant before any mailbox or DB access", async () => {
    await expect(reconcileVscRepliesOnce("neos")).rejects.toThrow(); expect(load).not.toHaveBeenCalled(); expect(inbox).not.toHaveBeenCalled();
  });
  it("commits the checkpoint only after all replies are recorded", async () => {
    expect(await reconcileVscRepliesOnce("vsc")).toEqual({ inspected: 4, matched: 1, recorded: 1, hasMore: true });
    expect(save).toHaveBeenCalledWith("vsc", cursor, batch);
    expect(record.mock.invocationCallOrder[0]).toBeLessThan(save.mock.invocationCallOrder[0]);
  });
  it("does not advance on an IMAP failure", async () => {
    inbox.mockRejectedValue(new Error("offline")); await expect(reconcileVscRepliesOnce("vsc")).rejects.toThrow("offline"); expect(save).not.toHaveBeenCalled();
  });
  it("retries a partially recorded batch without losing replies", async () => {
    match.mockResolvedValue([candidate, { ...candidate, inboundMessageId: "<second@example.com>" }]);
    record.mockResolvedValueOnce({ recorded: true }).mockRejectedValueOnce(new Error("db offline"));
    await expect(reconcileVscRepliesOnce("vsc")).rejects.toThrow("db offline"); expect(save).not.toHaveBeenCalled();
    record.mockResolvedValueOnce({ recorded: false }).mockResolvedValueOnce({ recorded: true });
    expect((await reconcileVscRepliesOnce("vsc")).recorded).toBe(1); expect(save).toHaveBeenCalledTimes(1);
  });
  it("advances across empty UID ranges left by deleted messages", async () => {
    match.mockResolvedValue([]); expect((await reconcileVscRepliesOnce("vsc")).matched).toBe(0); expect(save).toHaveBeenCalled();
  });
  it("reports a checkpoint conflict instead of claiming success", async () => {
    save.mockRejectedValue(new Error("concurrent")); await expect(reconcileVscRepliesOnce("vsc")).rejects.toThrow("concurrent");
  });
});
