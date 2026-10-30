import { describe, expect, it } from "vitest";
import { defaultVscEmailContent, validateVscEmailContent } from "./email-content";
describe("VSC draft email content", () => {
  it("keeps the complete agreed offer in each proposed message", () => {
    const content = defaultVscEmailContent();
    for (const message of content.messages) {
      expect(message.text).toContain("79 € HT au lieu de 159 € HT");
      expect(message.text).toContain("jusqu’à la vente"); expect(message.text).toContain("30 novembre 2026");
      expect(message.text).toContain("contact@vendresoncommerce.com");
    }
    expect(validateVscEmailContent(content)).toEqual(content);
  });
  it("rejects missing or duplicate steps, empty copy and header line breaks", () => {
    const content = defaultVscEmailContent();
    for (const value of [null, {}, { ...content, version: 2 }, { ...content, messages: [] }, { ...content, messages: [content.messages[0], content.messages[0], content.messages[2]] }, { ...content, messages: [null, content.messages[1], content.messages[2]] }, { ...content, messages: [{ ...content.messages[0], subject: "Hello\r\nBcc: other@example.invalid" }, ...content.messages.slice(1)] }, { ...content, messages: [{ ...content.messages[0], text: " " }, ...content.messages.slice(1)] }, { ...content, messages: [{ ...content.messages[0], text: "x".repeat(6001) }, ...content.messages.slice(1)] }]) expect(() => validateVscEmailContent(value)).toThrow();
  });
  it("canonicalizes order and removes unsupported fields without mutating defaults", () => {
    const original = defaultVscEmailContent();
    expect(validateVscEmailContent({ ...original, messages: [...original.messages].reverse(), approved: true })).toEqual(original);
    const changed = defaultVscEmailContent(); changed.messages[0].text = "Custom text";
    expect(defaultVscEmailContent().messages[0].text).not.toBe("Custom text");
  });
});
