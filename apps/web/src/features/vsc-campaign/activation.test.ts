import { describe, expect, it } from "vitest";
import { decideVscActivation } from "./activation";

const input = {
  campaign: { tenantId: "vsc", state: "approved" as const,
    approvedBy: "owner", approvedAt: "2026-10-28T09:00:00Z", enabledAt: null },
  configuredTenantId: "vsc",
  smtpVerified: true, imapVerified: true, unsubscribeReady: true,
  complianceReviewed: true, userConfirmedLaunch: true
};

describe("VSC activation prerequisites", () => {
  it("permits only a fully verified and confirmed launch", () => {
    expect(decideVscActivation(input)).toEqual({ allowed: true, nextState: "active" });
  });
  it("blocks missing reply detection, unsubscribe or explicit approval", () => {
    expect(decideVscActivation({ ...input, imapVerified: false }).allowed).toBe(false);
    expect(decideVscActivation({ ...input, unsubscribeReady: false }).allowed).toBe(false);
    expect(decideVscActivation({ ...input, userConfirmedLaunch: false }).allowed).toBe(false);
  });
  it("blocks a different tenant and incomplete compliance review", () => {
    expect(decideVscActivation({ ...input, configuredTenantId: "neos" }).allowed).toBe(false);
    expect(decideVscActivation({ ...input, complianceReviewed: false }).allowed).toBe(false);
  });
});
