import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("safe back link source", () => {
  it("uses browser history only when the referrer is internal", () => {
    const source = readFileSync(join(process.cwd(), "src/components/navigation/safe-back-link.tsx"), "utf8");

    expect(source).toContain("previous.origin === window.location.origin");
    expect(source).toContain("previous.href !== window.location.href");
    expect(source).toContain("router.back()");
    expect(source).toContain("fallbackHref");
  });

  it("is used by core detail pages instead of fixed module-list return links", () => {
    const files = [
      "src/app/(app)/people/[id]/page.tsx",
      "src/app/(app)/organizations/[id]/page.tsx",
      "src/app/(app)/relationships/[id]/page.tsx",
      "src/app/(app)/tasks/[id]/page.tsx",
      "src/app/(app)/projects/[id]/page.tsx",
      "src/app/(app)/interactions/[id]/page.tsx"
    ];

    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source).toContain("SafeBackLink");
    }
  });
});

