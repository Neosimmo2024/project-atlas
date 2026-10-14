import { describe, expect, it } from "vitest";
import { simpleParser } from "mailparser";
import { mailboxUidBatch, messageIdVariants, replyReferences, trackedReplyReference } from "./reply-policy";
describe("mailbox reply matching", () => {
  it("checks newest messages during backfill without advancing past unscanned history", () => {
    const result = mailboxUidBatch(Array.from({ length: 1000 }, (_, i) => i + 1), 0);
    expect(result.uids.slice(0, 20)).toEqual(Array.from({ length: 20 }, (_, i) => i + 981));
    expect(Math.max(...result.historyIds)).toBe(500);
    expect(result.historyIds.has(1000)).toBe(false);
    expect(new Set(result.uids).size).toBe(520);
    expect(mailboxUidBatch([1, 2, 2, 3], 1).uids).toEqual([2, 3]);
  });
  it("matches only tracked exact IDs and keeps reference priority", () => {
    expect(trackedReplyReference(["<manual@example.org>", "<initial@example.org>"], new Set(["manual@example.org", "initial@example.org"]))).toBe("<manual@example.org>");
    expect(trackedReplyReference(["<unrelated@example.org>"], new Set(["initial@example.org"]))).toBeNull();
  });
  it("uses exact thread references rather than subject or sender similarity", async () => {
    const mail = await simpleParser("Subject: Re: NEOS IMMO\r\nFrom: person@example.org\r\nIn-Reply-To: <current@example.org>\r\nReferences: <original@example.org> <current@example.org>\r\n\r\nMerci");
    expect(replyReferences(mail)).toEqual(["<current@example.org>", "<original@example.org>"]);
    expect(messageIdVariants("<current@example.org>")).toContain("current@example.org");
    const unrelated = await simpleParser("Subject: Re: NEOS IMMO\r\nFrom: person@example.org\r\n\r\nAutre sujet");
    expect(replyReferences(unrelated)).toEqual([]);
  });
  it("does not stop campaigns for vacation replies or bulk emails", async () => {
    for (const header of ["Auto-Submitted: auto-replied", "Precedence: bulk"]) {
      const mail = await simpleParser(`${header}\r\nIn-Reply-To: <sent@example.org>\r\n\r\nAbsent`);
      expect(replyReferences(mail)).toEqual([]);
    }
  });
});
