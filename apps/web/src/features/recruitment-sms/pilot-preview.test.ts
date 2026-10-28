import { describe, expect, it } from "vitest";
import { prepareSmsPilotPreview, SMS_PILOT_MESSAGE } from "./pilot-preview";

describe("personal SMS pilot preparation", () => {
  it.each(["06 12 34 56 78", "+33 6 12 34 56 78", "06.12.34.56.78"])("normalizes %s without sending", phone => {
    expect(prepareSmsPilotPreview(phone)).toEqual({ status: "prepared", recipient: "+33612345678", content: SMS_PILOT_MESSAGE, characterCount: SMS_PILOT_MESSAGE.length, sent: false });
  });
  it("accepts a 07 mobile", () => {
    expect(prepareSmsPilotPreview("0712345678")).toMatchObject({ status: "prepared", recipient: "+33712345678", sent: false });
  });
  it.each(["", "061234567", "06123456789", "0112345678", "+33112345678", "+33612345678,+33712345678", "0612345678\n0712345678", "+33(0)612345678", "+44612345678", "abc0612345678", "0".repeat(41)])("refuses unsupported or ambiguous recipient %j", phone => {
    expect(prepareSmsPilotPreview(phone).status).toBe("invalid");
  });
  it("keeps the approved technical draft within one basic GSM SMS", () => {
    expect(SMS_PILOT_MESSAGE.length).toBeLessThanOrEqual(160);
    expect(SMS_PILOT_MESSAGE).toMatch(/^[A-Za-z0-9 .'-]+$/);
  });
});
