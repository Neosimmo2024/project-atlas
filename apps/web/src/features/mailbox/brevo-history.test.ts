import { describe, expect, it } from "vitest";
import { campaignCandidateForReply, sentEvidence, uniquePersonForEmail } from "./brevo-history";
describe("Brevo outbound evidence", () => {
  const row = { email: "Person@lmdimmobilier.fr", from: "renato.ponzio@neos-immo.com", event: "delivered", date: "2026-10-06T09:00:00Z", messageId: "<unique@brevo>" };
  it("requires a sent-message identifier and confirmed delivery from NEOS", () => {
    expect(sentEvidence(row)).toMatchObject({ email: "person@lmdimmobilier.fr", messageId: "<unique@brevo>" });
    expect(sentEvidence({ ...row, event: "opened" })).toBeNull();
    expect(sentEvidence({ ...row, messageId: "" })).toBeNull();
    expect(sentEvidence({ ...row, from: "someone@other.example" })).toBeNull();
  });
  it("accepts the verified account's fallback sender without accepting unrelated senders", () => {
    expect(sentEvidence({ ...row, from: "contact@10759917.brevosend.com" })).not.toBeNull();
    expect(sentEvidence({ ...row, from: "contact@another.brevosend.com" })).toBeNull();
  });
  it("does not guess between repeated campaigns or match a fresh unrelated email", () => {
    const campaign = { id: "campaign", email: "person@example.org", subject: "Un café ?", sentAt: "2026-10-08T09:00:00Z" };
    expect(campaignCandidateForReply([campaign], campaign.email, "Re: Un café ?", "2026-10-09T09:00:00Z")).toBe("campaign");
    expect(campaignCandidateForReply([campaign, { ...campaign, id: "other" }], campaign.email, "Re: Un café ?", "2026-10-09T09:00:00Z")).toBeNull();
    expect(campaignCandidateForReply([campaign], campaign.email, "Un café ?", "2026-10-09T09:00:00Z")).toBeNull();
    expect(campaignCandidateForReply([campaign], campaign.email, "Re: Un café ?", "2026-10-07T09:00:00Z")).toBeNull();
  });
  it("does not merge homonyms or shared email addresses into an arbitrary person", () => {
    const index = new Map([["one@example.org", ["p1"]], ["shared@example.org", ["p2", "p3"]]]);
    expect(uniquePersonForEmail(index, "ONE@example.org")).toBe("p1");
    expect(uniquePersonForEmail(index, "shared@example.org")).toBeNull();
    expect(uniquePersonForEmail(index, "missing@example.org")).toBeNull();
  });
});
