import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("safe back link source", () => {
  it("uses browser history only when the referrer is internal", () => {
    const source = readFileSync(join(process.cwd(), "src/components/navigation/safe-back-link.tsx"), "utf8");

    expect(source).toContain("previous.origin === window.location.origin");
    expect(source).toContain("previous.href !== window.location.href");
    expect(source).toContain("useHistory = true");
    expect(source).toContain("if (!useHistory) return;");
    expect(source).toContain("router.back()");
    expect(source).toContain("fallbackHref");
  });

  it("is used by core detail pages instead of fixed module-list return links", () => {
    const files = [
      "src/app/(app)/people/[id]/page.tsx",
      "src/app/(app)/organizations/[id]/page.tsx",
      "src/app/(app)/relationships/[id]/page.tsx",
      "src/app/(app)/tasks/[id]/page.tsx",
      "src/app/(app)/interactions/[id]/page.tsx"
    ];

    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source).toContain("SafeBackLink");
    }
  });

  it("keeps the Project detail back action stable and preserves a Relationship context", () => {
    const source = readFileSync(join(process.cwd(), "src/app/(app)/projects/[id]/page.tsx"), "utf8");

    expect(source).toContain('const returnTo = safeReturnTo(valueOf(query, "returnTo"))');
    expect(source).toContain('value.startsWith("/relationships/")');
    expect(source).toContain('href={returnTo}>Retour</Link>');
    expect(source).not.toContain("SafeBackLink");
  });

  it("keeps relationship detail return stable from a Person detail page", () => {
    const source = readFileSync(join(process.cwd(), "src/app/(app)/relationships/[id]/page.tsx"), "utf8");

    expect(source).toContain('const isPersonReturn = /^\\/people\\/[^/]+$/.test(parsed.pathname);');
    expect(source).toContain('fallbackHref={returnTo} useHistory={false}');
  });

  it("keeps Organization detail return stable from a Relationship detail page", () => {
    const relationship = readFileSync(join(process.cwd(), "src/app/(app)/relationships/[id]/page.tsx"), "utf8");
    const organization = readFileSync(join(process.cwd(), "src/app/(app)/organizations/[id]/page.tsx"), "utf8");

    expect(relationship).toContain("returnTo=${encodeURIComponent(relationshipReturnPath)}");
    expect(organization).toContain('safeOrganizationReturnTo(valueOf(query, "returnTo"))');
    expect(organization).toContain('fallbackHref={returnTo} useHistory={returnTo === "/organizations"}');
  });

  it("keeps task detail return stable from the Action Plan and contextual detail pages", () => {
    const source = readFileSync(join(process.cwd(), "src/app/(app)/tasks/[id]/page.tsx"), "utf8");
    const helper = readFileSync(join(process.cwd(), "src/features/tasks/task-detail-return.ts"), "utf8");

    expect(source).toContain("safeTaskReturnTo(valueOf(query, \"returnTo\"))");
    expect(helper).toContain('parsed.pathname === "/action-plan"');
    expect(helper).toContain("organizationId");
    expect(helper).toContain("DETAIL_RETURN_PATH");
    expect(helper).toContain('return "/tasks";');
    expect(source).toContain('fallbackHref={returnTo} useHistory={returnTo === "/tasks"}');
  });
});
