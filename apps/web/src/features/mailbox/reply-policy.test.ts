import { describe, expect, it } from "vitest";
import { simpleParser } from "mailparser";
import { messageIdVariants, replyReferences } from "./reply-policy";
describe("mailbox reply matching", () => {
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
