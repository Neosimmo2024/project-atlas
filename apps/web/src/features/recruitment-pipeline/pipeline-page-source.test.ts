import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("pipeline page source", () => {
  it("does not return a 404 when the authenticated session has no active tenant", () => {
    const source = readFileSync(join(process.cwd(), "src/app/(app)/pipeline/page.tsx"), "utf8");

    expect(source).not.toContain("notFound");
    expect(source).toContain("Aucun tenant actif");
    expect(source).toContain("Votre session est valide");
  });
});
