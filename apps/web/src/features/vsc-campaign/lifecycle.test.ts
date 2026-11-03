import { describe, expect, it } from "vitest";
import { mayActivateVscCampaign, mayClaimVscDelivery, shouldStopVscSequence } from "./lifecycle";

describe("VSC campaign lifecycle", () => {
  it("requires explicit approval from the correct tenant", () => {
    const record = { tenantId: "vsc", state: "approved" as const, approvedBy: "owner",
      approvedAt: "2026-10-28T08:00:00Z", enabledAt: null };
    expect(mayActivateVscCampaign(record, "vsc")).toBe(true);
    expect(mayActivateVscCampaign(record, "neos")).toBe(false);
    expect(mayActivateVscCampaign({ ...record, approvedBy: null }, "vsc")).toBe(false);
    expect(mayActivateVscCampaign({ ...record, state: "draft" }, "vsc")).toBe(false);
  });
  it("stops on reply or unsubscribed status", () => {
    const base = { replied: false, unsubscribed: false, doNotContact: false,
      appointmentBooked: false, purchased: false, campaignState: "active" as const };
    expect(shouldStopVscSequence(base)).toBe(false);
    expect(shouldStopVscSequence({ ...base, replied: true })).toBe(true);
    expect(shouldStopVscSequence({ ...base, unsubscribed: true })).toBe(true);
    expect(shouldStopVscSequence({ ...base, campaignState: "paused" })).toBe(true);
  });
  it("claims only due unsent deliveries of an active VSC campaign", () => {
    const base = { campaignState: "active" as const, deliveryState: "scheduled" as const,
      due: true, tenantMatches: true, stopped: false };
    expect(mayClaimVscDelivery(base)).toBe(true);
    expect(mayClaimVscDelivery({ ...base, deliveryState: "sent" })).toBe(false);
    expect(mayClaimVscDelivery({ ...base, tenantMatches: false })).toBe(false);
    expect(mayClaimVscDelivery({ ...base, stopped: true })).toBe(false);
  });
});
