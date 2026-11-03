import { describe, expect, it } from "vitest";
import { simulateVscCampaignLifecycle } from "./lifecycle-simulation";

const lead = {
  id: "shop-1", tenantId: "vsc", unsubscribed: false,
  contact: { email: "shop@example.com", mobile: "0612345678",
    doNotContact: false, emailOptOut: false, smsOptOut: false,
    replied: false, appointmentBooked: false, purchased: false }
};

describe("VSC fictitious full lifecycle", () => {
  it("prepares a campaign, recognizes a reply and stops pending followups", () => {
    expect(simulateVscCampaignLifecycle({
      tenantId: "vsc", startDate: "2026-10-28", leads: [lead]
    })).toEqual({ draftCount: 3, replyMatched: true, pendingAfterReply: 0 });
  });
  it("never plans work for a foreign tenant", () => {
    expect(simulateVscCampaignLifecycle({
      tenantId: "vsc", startDate: "2026-10-28",
      leads: [{ ...lead, tenantId: "neos" }]
    })).toEqual({ draftCount: 0, replyMatched: false, pendingAfterReply: 0 });
  });
});
