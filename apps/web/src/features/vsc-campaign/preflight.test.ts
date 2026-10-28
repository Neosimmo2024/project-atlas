import { describe, expect, it } from "vitest";
import { validateVscPreflight, type VscPreflight } from "./preflight";

const ready: VscPreflight = {
  tenantId: "vsc", configuredTenantId: "vsc",
  sender: "contact@vendresoncommerce.com", channel: "email",
  scheduledDate: "2026-10-28",
  campaignApproved: true, campaignEnabled: true, providerConfigured: true,
  contact: { email: "shop@example.com", mobile: "0612345678",
    doNotContact: false, emailOptOut: false, smsOptOut: false,
    replied: false, appointmentBooked: false, purchased: false }
};

describe("VSC preflight is fail closed", () => {
  it("allows only a fully approved configured eligible request", () => {
    expect(validateVscPreflight(ready)).toEqual({ allowed: true });
  });
  it("blocks another tenant and a wrong sender", () => {
    expect(validateVscPreflight({ ...ready, tenantId: "neos" }).allowed).toBe(false);
    expect(validateVscPreflight({ ...ready, sender: "personal@gmail.com" }).allowed).toBe(false);
  });
  it("blocks campaigns without explicit approval or activation", () => {
    expect(validateVscPreflight({ ...ready, campaignApproved: false }).allowed).toBe(false);
    expect(validateVscPreflight({ ...ready, campaignEnabled: false }).allowed).toBe(false);
    expect(validateVscPreflight({ ...ready, providerConfigured: false }).allowed).toBe(false);
  });
  it("blocks replies, purchases, opt-outs and expired promotions", () => {
    expect(validateVscPreflight({ ...ready, contact: { ...ready.contact, replied: true } }).allowed).toBe(false);
    expect(validateVscPreflight({ ...ready, contact: { ...ready.contact, emailOptOut: true } }).allowed).toBe(false);
    expect(validateVscPreflight({ ...ready, scheduledDate: "2026-12-01" }).allowed).toBe(false);
  });
});
