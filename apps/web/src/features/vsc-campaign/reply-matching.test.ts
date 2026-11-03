import { describe, expect, it } from "vitest";
import { matchVscInboxReplies } from "./reply-matching";

const envelope = {
  messageId: "<incoming@example.com>", from: "shop@example.com",
  inReplyTo: "<outbound@example.com>", references: [],
  receivedAt: "2026-10-28T09:00:00Z"
};
const outbound = {
  tenantId: "vsc", campaignId: "campaign-1", personId: "person-1",
  recipientEmail: "shop@example.com", providerMessageId: "<outbound@example.com>"
};

describe("VSC inbox-to-campaign matching", () => {
  it("matches only a known message from the same tenant and sender", () => {
    expect(matchVscInboxReplies({
      tenantId: "vsc", envelopes: [envelope], outbounds: [outbound]
    })).toHaveLength(1);
    expect(matchVscInboxReplies({
      tenantId: "neos", envelopes: [envelope], outbounds: [outbound]
    })).toEqual([]);
    expect(matchVscInboxReplies({
      tenantId: "vsc", envelopes: [{ ...envelope, from: "other@example.com" }], outbounds: [outbound]
    })).toEqual([]);
  });
  it("deduplicates inbound messages", () => {
    expect(matchVscInboxReplies({
      tenantId: "vsc", envelopes: [envelope, envelope], outbounds: [outbound]
    })).toHaveLength(1);
  });
});
