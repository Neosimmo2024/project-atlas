import { beforeEach, describe, expect, it, vi } from "vitest";
const preview = vi.fn();
const record = vi.fn();
vi.mock("@/services/vsc-reply-reconciliation", () => ({
  previewVscReplyReconciliation: preview
}));
vi.mock("@/services/vsc-inbound-reply-journal", () => ({
  recordVerifiedVscReply: record
}));
import { reconcileVscRepliesOnce } from "./vsc-reply-worker";

const candidate = {
  tenantId: "vsc", campaignId: "campaign", personId: "person",
  inboundMessageId: "<reply@example.com>", originalOutboundMessageId: "<sent@example.com>",
  inboundFrom: "shop@example.com", expectedEmail: "shop@example.com",
  isReplyToCampaign: true, receivedAt: "2026-10-28T09:00:00Z"
};

describe("VSC reply worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VSC_OVH_TENANT_ID = "vsc";
    preview.mockResolvedValue({ inspected: 4, matches: [candidate], dryRun: true });
    record.mockResolvedValue({ recorded: true });
  });
  it("refuses any other tenant before inspecting IMAP", async () => {
    await expect(reconcileVscRepliesOnce("neos")).rejects.toThrow();
    expect(preview).not.toHaveBeenCalled();
  });
  it("records matched replies once and reports totals", async () => {
    expect(await reconcileVscRepliesOnce("vsc")).toEqual({
      inspected: 4, matched: 1, recorded: 1
    });
    expect(record).toHaveBeenCalledWith(candidate, "vsc");
  });
  it("does not count already recorded duplicate replies", async () => {
    record.mockResolvedValue({ recorded: false });
    expect((await reconcileVscRepliesOnce("vsc")).recorded).toBe(0);
  });
});
