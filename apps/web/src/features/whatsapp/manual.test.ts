import { describe, expect, it } from "vitest";
import { normalizeWhatsAppPhone, whatsappLink } from "./manual";
describe("WhatsApp manual links", () => {
  it.each(["06 12 34 56 78", "+33 (6) 12 34 56 78", "0033612345678"])("normalizes %s", (phone) => expect(normalizeWhatsAppPhone(phone)).toBe("33612345678"));
  it.each([null, "", "0612", "javascript:alert(1)", "0612345678 ext 4", "33612345678"])("rejects ambiguous or unsafe phone %s", (phone) => expect(normalizeWhatsAppPhone(phone)).toBeNull());
  it("encodes a message without changing its content", () => {
    const url = new URL(whatsappLink("0612345678", "Bonjour, café & rendez-vous ?")!);
    expect(url.origin).toBe("https://wa.me");
    expect(url.searchParams.get("text")).toBe("Bonjour, café & rendez-vous ?");
    expect(whatsappLink("0612345678", " ")).toBeNull();
  });
});
