import { expect, it } from "vitest";
import { availableWhatsAppTemplates, personalizeWhatsAppMessage } from "./templates";
it("personalizes all occurrences and preserves the event link", () => {
 const template = availableWhatsAppTemplates(Date.parse("2026-10-13T09:00:00Z"))[0];
 const text = personalizeWhatsAppMessage(template.body, "  Coralie  ");
 expect(text.startsWith("Bonjour Coralie,")).toBe(true);
 expect(text).not.toContain("[Prénom]");
 expect(text).toContain("https://event.lpgi.club/afterwork");
});
it("does not invent a first name", () => expect(personalizeWhatsAppMessage("Bonjour [Prénom], bienvenue !", "")).toBe("Bonjour, bienvenue !"));
it("removes the invitation once the event starts", () => expect(availableWhatsAppTemplates(Date.parse("2026-10-15T18:30:00+02:00")).map(t=>t.id)).toEqual(["followup"]));
