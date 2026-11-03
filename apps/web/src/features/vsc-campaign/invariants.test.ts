import { describe, expect, it } from "vitest";
import { vscEligibleSteps, type VscContact } from "./policy";
import { validateVscPreflight } from "./preflight";

const contact: VscContact = {
  email: "commerce@example.com", mobile: "0612345678",
  doNotContact: false, emailOptOut: false, smsOptOut: false,
  replied: false, appointmentBooked: false, purchased: false
};

describe("VSC campaign integration invariants", () => {
  it("never authorizes a step from a different tenant", () => {
    for (const step of vscEligibleSteps(contact, "2026-10-28")) {
      expect(validateVscPreflight({
        tenantId: "neos", configuredTenantId: "vsc",
        sender: "contact@vendresoncommerce.com", channel: step.channel,
        scheduledDate: step.scheduledDate, contact,
        campaignApproved: true, campaignEnabled: true, providerConfigured: true
      }).allowed).toBe(false);
    }
  });
  it("requires active approval at execution time, not only scheduling time", () => {
    const [step] = vscEligibleSteps(contact, "2026-10-28");
    expect(validateVscPreflight({
      tenantId: "vsc", configuredTenantId: "vsc",
      sender: "contact@vendresoncommerce.com", channel: step.channel,
      scheduledDate: step.scheduledDate,
      contact: { ...contact, replied: true },
      campaignApproved: true, campaignEnabled: true, providerConfigured: true
    }).allowed).toBe(false);
  });
});
