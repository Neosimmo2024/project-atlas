import { describe, expect, it } from "vitest";
import { buildVscReviewPlan, type VscLead } from "./review-plan";

const lead: VscLead = {
  id: "shop-1", tenantId: "vsc", unsubscribed: false,
  contact: { email: "shop@example.com", mobile: "0612345678",
    doNotContact: false, emailOptOut: false, smsOptOut: false,
    replied: false, appointmentBooked: false, purchased: false }
};

describe("VSC review-only plan", () => {
  it("deduplicates contacts and never includes another tenant", () => {
    const plan = buildVscReviewPlan({
      leads: [lead, lead, { ...lead, id: "neos-1", tenantId: "neos" }],
      tenantId: "vsc", startDate: "2026-10-28", campaignState: "draft"
    });
    expect(plan).toHaveLength(3);
    expect(plan.every(x => x.tenantId === "vsc" && x.status === "draft")).toBe(true);
    expect(new Set(plan.map(x => x.key)).size).toBe(plan.length);
  });
  it("does not plan for replied or unsubscribed contacts", () => {
    const plan = buildVscReviewPlan({
      leads: [{ ...lead, unsubscribed: true }, { ...lead, id: "shop-2",
        contact: { ...lead.contact, replied: true } }],
      tenantId: "vsc", startDate: "2026-10-28", campaignState: "draft"
    });
    expect(plan).toEqual([]);
  });
  it("rejects planning for active campaigns", () => {
    expect(() => buildVscReviewPlan({
      leads: [lead], tenantId: "vsc", startDate: "2026-10-28", campaignState: "active"
    })).toThrow();
  });
});
