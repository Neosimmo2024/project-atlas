import { describe, expect, it } from "vitest";
import { validateVscReplyCandidate, type VscReplyCandidate } from "./inbound-replies";

const reply: VscReplyCandidate = {
  tenantId: "vsc", campaignId: "campaign", personId: "person",
  inboundMessageId: "<reply@example.com>", inboundFrom: "shop@example.com",
  expectedEmail: "shop@example.com", isReplyToCampaign: true,
  receivedAt: "2026-10-28T08:00:00Z"
};

describe("VSC reply attribution", () => {
  it("accepts a properly linked reply for the right tenant", () => {
    expect(validateVscReplyCandidate(reply, "vsc")).toEqual({ accepted: true });
  });
  it("rejects unrelated mail and cross-tenant attribution", () => {
    expect(validateVscReplyCandidate(reply, "neos").accepted).toBe(false);
    expect(validateVscReplyCandidate({ ...reply, isReplyToCampaign: false }, "vsc").accepted).toBe(false);
  });
  it("rejects a different sender and malformed identifiers", () => {
    expect(validateVscReplyCandidate({ ...reply, inboundFrom: "other@example.com" }, "vsc").accepted).toBe(false);
    expect(validateVscReplyCandidate({ ...reply, inboundMessageId: "" }, "vsc").accepted).toBe(false);
  });
});
