import { describe, expect, it } from "vitest";
import { escapedReplyHtml, incomingReplyText, suggestReply } from "./reply-draft";
describe("reviewed reply suggestions", () => {
  it("keeps a meeting invitation reply in its campaign context", () => {
    expect(suggestReply("Oui, avec plaisir", "NEOS IMMO — Café Saint-Maur")).toContain("notre rencontre");
    expect(suggestReply("Oui, avec plaisir", "NEOS IMMO — Café Saint-Maur")).not.toContain("75 %");
  });
  it("honours refusals even when the quoted original email contains recruitment keywords", () => {
    const text = "Je ne suis pas intéressé.\n\nLe 14 octobre Renato a écrit :\nRémunération 100%";
    expect(incomingReplyText(text)).not.toContain("100%");
    expect(suggestReply(text)).toContain("mets fin");
    expect(suggestReply(text)).not.toContain("calendly");
  });
  it("does not invent an appointment or guarantee a commission rate", () => {
    expect(suggestReply("Quelles sont les commissions ?")).toContain("conditions applicables");
    const draft = suggestReply("Disponible jeudi pour un appel");
    expect(draft).toContain("disponibilités");
    expect(draft).not.toContain("jeudi");
  });
  it("escapes email HTML instead of executing incoming or edited markup", () => {
    expect(escapedReplyHtml('<script>alert("x")</script>')).not.toContain("<script>");
  });
});
