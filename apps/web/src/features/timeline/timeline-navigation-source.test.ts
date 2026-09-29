import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("timeline contextual navigation", () => {
  it("preserves the chronology page when an interaction is opened", () => {
    const list = readFileSync(join(process.cwd(), "src/components/timeline/timeline-list.tsx"), "utf8");
    const item = readFileSync(join(process.cwd(), "src/components/timeline/timeline-item.tsx"), "utf8");

    expect(list).toContain("returnHref={returnHref}");
    expect(item).toContain("returnTo=${encodeURIComponent(returnHref)}");
    expect(item).toContain("sourceHref(event, returnHref)");
  });
});
