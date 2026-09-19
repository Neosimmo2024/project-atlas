import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("person relationship navigation", () => {
  it("opens a linked relationship and preserves the person return target", () => {
    const page = source("src/app/(app)/people/[id]/page.tsx");

    expect(page).toContain("/relationships/${relationship.id}?returnTo=");
    expect(page).toContain("encodeURIComponent(personReturnPath)");
  });
});
