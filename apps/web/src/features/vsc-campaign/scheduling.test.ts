import { describe, expect, it } from "vitest";
import { vscEligibleSteps, type VscContact } from "./policy";

const base: VscContact = {
  email: "commerce@example.com", mobile: "0612345678",
  doNotContact: false, emailOptOut: false, smsOptOut: false,
  replied: false, appointmentBooked: false, purchased: false
};

describe("VSC campaign scheduling boundaries", () => {
  it("includes last eligible promotional day", () => {
    expect(vscEligibleSteps(base, "2026-11-30").map(s => s.key)).toEqual(["offer"]);
  });
  it("rejects invalid calendar dates", () => {
    expect(() => vscEligibleSteps(base, "2026-02-30")).toThrow("Date invalide");
  });
  it("does not include any message after the offer deadline", () => {
    const steps = vscEligibleSteps(base, "2026-11-20");
    expect(steps.map(s => s.key)).toEqual(["offer", "sms-reminder"]);
  });
  it("keeps SMS-only leads on SMS channel", () => {
    const steps = vscEligibleSteps({ ...base, email: null }, "2026-10-28");
    expect(steps.every(s => s.channel === "sms")).toBe(true);
    expect(steps.map(s => s.offsetDays)).toEqual([0, 15, 30]);
  });
});
