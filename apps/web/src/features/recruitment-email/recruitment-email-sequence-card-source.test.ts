import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("recruitment email sequence card", () => {
  it("does not expose the Brevo provider message identifier", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/people/recruitment-email-sequence-card.tsx"),
      "utf8"
    );

    expect(source).not.toContain("Identifiant Brevo initial");
    expect(source).not.toContain("displayedSequence.provider_message_id");
  });
});
