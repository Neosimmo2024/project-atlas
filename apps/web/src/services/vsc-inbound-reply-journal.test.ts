import { describe, expect, it, vi, beforeEach } from "vitest";

const maybeSingle = vi.fn();
const rpc = vi.fn();
const from = vi.fn(() => ({
  select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ eq: () => ({
    eq: () => ({ maybeSingle })
  }) }) }) }) })
}));
vi.mock("@/lib/supabase/service-role", () => ({
  createSupabaseServiceRoleClient: () => ({ from, rpc })
}));
import { recordVerifiedVscReply } from "./vsc-inbound-reply-journal";

const reply = {
  tenantId: "vsc", campaignId: "campaign", personId: "person",
  inboundMessageId: "<reply@example.com>",
  originalOutboundMessageId: "<sent@example.com>",
  inboundFrom: "shop@example.com", expectedEmail: "shop@example.com",
  isReplyToCampaign: true, receivedAt: "2026-10-28T08:00:00Z"
};

describe("VSC verified reply journal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    maybeSingle.mockResolvedValue({ data: { id: "outbound" }, error: null });
    rpc.mockResolvedValue({ data: true, error: null });
  });
  it("rejects an unrelated tenant before database access", async () => {
    await expect(recordVerifiedVscReply(reply, "neos")).rejects.toThrow();
    expect(from).not.toHaveBeenCalled();
  });
  it("does not record when the original message is unknown", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(recordVerifiedVscReply(reply, "vsc")).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("records a verified reply only after matching original outbound message", async () => {
    expect(await recordVerifiedVscReply(reply, "vsc")).toEqual({ recorded: true });
    expect(rpc).toHaveBeenCalledWith("vsc_record_verified_reply", expect.objectContaining({
      p_tenant_id: "vsc", p_message_id: "<reply@example.com>"
    }));
  });
});
