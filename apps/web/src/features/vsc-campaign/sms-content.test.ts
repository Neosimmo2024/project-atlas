import { describe, expect, it } from "vitest";
import { defaultVscSmsContent, estimateVscSms, previewVscSms, VSC_SMS_STOP_PLACEHOLDER } from "./sms-content";
describe("VSC review-only SMS preparation", () => {
  const input = () => ({ today: "2026-10-29", startDate: "2026-10-29", hasEmail: true, messages: defaultVscSmsContent() });
  it("keeps the agreed offer and the official Brevo STOP token in all five proposals", () => {
    expect(VSC_SMS_STOP_PLACEHOLDER).toBe("[STOP_CODE]");
    const messages = defaultVscSmsContent(); expect(messages).toHaveLength(5);
    for (const message of messages) {
      for (const part of ["79 EUR HT au lieu de 159 EUR HT", "jusqu'a la vente", "30 novembre 2026", "vendresoncommerce.com", VSC_SMS_STOP_PLACEHOLDER]) expect(message.text).toContain(part);
      expect(message.text).not.toContain("36105"); expect(estimateVscSms(message.text).encoding).toBe("GSM-7");
    }
  });
  it("prepares the single email-plus-mobile reminder five days after the initial email", () => {
    expect(previewVscSms(input()).map(x => [x.stepKey, x.scheduledDate])).toEqual([["sms-reminder", "2026-11-03"]]);
  });
  it("prepares mobile-only dates every fifteen days, dropping expired steps", () => {
    expect(previewVscSms({ ...input(), hasEmail: false }).map(x => x.scheduledDate)).toEqual(["2026-10-29", "2026-11-13", "2026-11-28"]);
    expect(previewVscSms({ ...input(), startDate: "2026-11-30", hasEmail: false }).map(x => x.stepKey)).toEqual(["sms-initial"]);
    expect(previewVscSms({ ...input(), startDate: "2026-11-26" })).toEqual([]);
  });
  it("rejects past, impossible and expired dates including an expired current day", () => {
    for (const date of ["2026-10-28", "2026-02-31", "2026-12-01", ""])
      expect(() => previewVscSms({ ...input(), startDate: date })).toThrow();
    expect(() => previewVscSms({ ...input(), today: "2026-12-01", startDate: "2026-12-01" })).toThrow();
  });
  it("refuses missing, duplicate, empty, excessive and control-bearing texts", () => {
    for (const messages of [[], [input().messages[0], ...input().messages.slice(0, 4)], ...[" ", "x".repeat(2001), "text\u0000"].map(text => [{ ...input().messages[0], text }, ...input().messages.slice(1)])])
      expect(() => previewVscSms({ ...input(), messages })).toThrow();
  });
  it("uses edited copy without altering the default proposals", () => {
    const request = input(); request.messages[0].text = "Texte modifie";
    expect(previewVscSms(request)[0].text).toBe("Texte modifie"); expect(defaultVscSmsContent()[0].text).not.toBe("Texte modifie");
  });
  it("counts GSM extension characters as two units and handles single/multipart boundaries", () => {
    expect(estimateVscSms("éàèù")).toEqual({ encoding: "GSM-7", units: 4, segments: 1 });
    expect(estimateVscSms("€^{}\\[~]|\f").units).toBe(20);
    expect(estimateVscSms("a".repeat(160)).segments).toBe(1);
    expect(estimateVscSms("a".repeat(161)).segments).toBe(2);
    expect(estimateVscSms("a".repeat(306)).segments).toBe(2);
    expect(estimateVscSms("a".repeat(307)).segments).toBe(3);
    expect(estimateVscSms("^".repeat(153))).toEqual({ encoding: "GSM-7", units: 306, segments: 3 });
  });
  it("counts Unicode UTF-16 units and preserves emoji pairs at segment boundaries", () => {
    expect(estimateVscSms("’".repeat(70))).toEqual({ encoding: "Unicode", units: 70, segments: 1 });
    expect(estimateVscSms("’".repeat(71)).segments).toBe(2);
    expect(estimateVscSms("🙂".repeat(67))).toEqual({ encoding: "Unicode", units: 134, segments: 3 });
    expect(estimateVscSms("")).toEqual({ encoding: "GSM-7", units: 0, segments: 0 });
  });
});
