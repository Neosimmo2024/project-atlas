import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

describe("global search source", () => {
  it("keeps the global search mounted in desktop and mobile shell", () => {
    const source = readFileSync(join(root, "src/components/app-shell.tsx"), "utf8");

    expect(source.match(/<GlobalSearch \/>/g)).toHaveLength(2);
    expect(source).toContain("mobile-shell-bar");
    expect(source).toContain("sidebar");
  });

  it("keeps the browser API free of tenant selection", () => {
    const source = readFileSync(join(root, "src/app/api/search/route.ts"), "utf8");

    expect(source).toContain("getTenantContext()");
    expect(source).not.toContain("tenant_id");
    expect(source).not.toContain("tenantId =");
  });
});

