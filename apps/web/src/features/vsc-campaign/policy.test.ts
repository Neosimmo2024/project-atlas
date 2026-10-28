import { describe, expect, it } from "vitest";
import { vscCampaignSteps, vscEligibleSteps, isVscCalendarDate, isVscOfferCurrent, type VscContact } from "./policy";

const contact: VscContact = {
  email: "commerce@example.com", mobile: "0612345678", doNotContact: false,
  emailOptOut: false, smsOptOut: false, replied: false, appointmentBooked: false, purchased: false
};

describe("VendreSonCommerce campaign isolation policy", () => {
  it("validates real calendar days including leap years", () => {
    expect(isVscCalendarDate("2024-02-29")).toBe(true);
    expect(isVscCalendarDate("2026-02-29")).toBe(false);
    expect(isVscCalendarDate("2026-02-31")).toBe(false);
    expect(isVscCalendarDate("2026-13-01")).toBe(false);
    expect(isVscCalendarDate("not-a-date")).toBe(false);
    expect(() => vscEligibleSteps(contact, "2026-02-31")).toThrow("Date invalide");
  });
  it("ends the promotion at midnight Paris time and rejects invalid clocks", () => {
    expect(isVscOfferCurrent(new Date("2026-11-30T22:59:59.999Z"))).toBe(true);
    expect(isVscOfferCurrent(new Date("2026-11-30T23:00:00.000Z"))).toBe(false);
    expect(isVscOfferCurrent(new Date("invalid"))).toBe(false);
  });
  it("combines email and SMS only for available channels", () => {
    expect(vscCampaignSteps(contact).map(s => [s.channel, s.offsetDays])).toEqual([
      ["email", 0], ["sms", 5], ["email", 20], ["email", 40]
    ]);
  });
  it("does not send after a reply, sale, appointment or global opt-out", () => {
    for (const flag of ["replied", "purchased", "appointmentBooked", "doNotContact"] as const) {
      expect(vscCampaignSteps({ ...contact, [flag]: true })).toEqual([]);
    }
  });
  it("respects channel-specific opt-outs", () => {
    expect(vscCampaignSteps({ ...contact, smsOptOut: true }).every(s => s.channel === "email")).toBe(true);
    expect(vscCampaignSteps({ ...contact, emailOptOut: true }).every(s => s.channel === "sms")).toBe(true);
  });
  it("never schedules a promotional step after November 30", () => {
    const steps = vscEligibleSteps(contact, "2026-10-28");
    expect(steps.map(s => s.key)).toEqual(["offer", "sms-reminder", "consideration"]);
    expect(steps.every(s => s.scheduledDate <= "2026-11-30")).toBe(true);
  });
  it("does not schedule expired offers", () => {
    expect(vscEligibleSteps(contact, "2026-12-01")).toEqual([]);
  });
});
