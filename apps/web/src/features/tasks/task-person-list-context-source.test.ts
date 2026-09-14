import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("person task list context", () => {
  it("filters tasks by person, preserves that filter and links back to the person", () => {
    const page = source("src/app/(app)/tasks/page.tsx");
    const filters = source("src/components/tasks/task-filters.tsx");

    expect(page).toContain('const personId = valueOf(params, "personId")');
    expect(page).toContain("personId, page, pageSize: 10");
    expect(page).toContain("Retour à la fiche");
    expect(page).toContain("personId={personId}");
    expect(filters).toContain('name="personId" value={personId}');
  });
});
