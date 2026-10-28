import { describe, expect, it } from "vitest";
import { mayDispatchVscNow } from "./dispatch-gate";
import type { VscPreflight } from "./preflight";

const preflight: VscPreflight = {
  tenantId: "vsc", configuredTenantId: "vsc", sender: "contact@vendresoncommerce.com",
  channel: "email", scheduledDate: "2026-10-28", campaignApproved: true,
  campaignEnabled: true, providerConfigured: true,
  contact: { email: "shop@example.com", mobile: null, doNotContact: false,
    emailOptOut: false, smsOptOut: false, replied: false, appointmentBooked: false, purchased: false }
};
const input = {
  preflight, campaignState: "active" as const, deliveryState: "scheduled" as const,
  due: true, tenantMatches: true, replyRecorded: false, idempotencyClaimed: true
};

describe("VSC pre-dispatch gate", () => {
  it("allows only fully eligible claimed work", () => {
    expect(mayDispatchVscNow(input)).toEqual({ allowed: true });
  });
  it("refuses a reply or missing idempotency claim", () => {
    expect(mayDispatchVscNow({ ...input, replyRecorded: true }).allowed).toBe(false);
    expect(mayDispatchVscNow({ ...input, idempotencyClaimed: false }).allowed).toBe(false);
  });
  it("refuses a paused campaign or cross-tenant dispatch", () => {
    expect(mayDispatchVscNow({ ...input, campaignState: "paused" }).allowed).toBe(false);
    expect(mayDispatchVscNow({ ...input, tenantMatches: false }).allowed).toBe(false);
  });
});
