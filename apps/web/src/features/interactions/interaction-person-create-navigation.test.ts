import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("interaction creation from a person", () => {
  it("preserves the person context through creation and detail", () => {
    const personPage = readFileSync(resolve(process.cwd(), "src/app/(app)/people/[id]/page.tsx"), "utf8");
    const newPage = readFileSync(resolve(process.cwd(), "src/app/(app)/interactions/new/page.tsx"), "utf8");
    const form = readFileSync(resolve(process.cwd(), "src/components/interactions/interaction-form.tsx"), "utf8");

    expect(personPage).toContain("/interactions/new?personId=");
    expect(personPage).toContain("Nouvel échange");
    expect(newPage).toContain("returnTo={requestedReturnTo}");
    expect(form).toContain("returnTo=\${encodeURIComponent(returnTo)}");
  });
});
