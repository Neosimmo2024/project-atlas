import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

function source(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("foundation UI source contracts", () => {
  it("exports the requested reusable components", () => {
    const index = source("components/ui/index.ts");
    for (const moduleName of [
      "badge",
      "button",
      "card",
      "confirm-dialog",
      "entity",
      "filter-bar",
      "input",
      "metric-card",
      "page-header",
      "pagination",
      "search-input",
      "section",
      "states",
      "timeline-item"
    ]) {
      expect(index).toContain(`./${moduleName}`);
    }
  });

  it("keeps accessibility hooks in shared states and dialogs", () => {
    expect(source("components/ui/states.tsx")).toContain('role="alert"');
    expect(source("components/ui/states.tsx")).toContain('role="status"');
    expect(source("components/ui/confirm-dialog.tsx")).toContain('role="dialog"');
    expect(source("components/ui/confirm-dialog.tsx")).toContain('event.key === "Escape"');
  });

  it("keeps search, filters and pagination configurable by props", () => {
    expect(source("components/ui/search-input.tsx")).toContain('type="search"');
    expect(source("components/ui/filter-bar.tsx")).toContain("FormHTMLAttributes");
    expect(source("components/ui/pagination.tsx")).toContain("hrefForPage");
    expect(source("components/ui/pagination.tsx")).toContain("pageCount <= 1");
  });

  it("demonstrates limited Projects integration with the shared primitives", () => {
    expect(source("app/(app)/projects/page.tsx")).toContain("PageHeader");
    expect(source("components/projects/project-filters.tsx")).toContain("FilterBar");
    expect(source("components/projects/project-filters.tsx")).toContain("SearchInput");
    expect(source("components/projects/project-list.tsx")).toContain("Pagination");
    expect(source("components/projects/project-tabs.tsx")).toContain("EntityTabs");
  });
});
