import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("task list context", () => {
  it("filters tasks by person or relationship, preserves those filters and links back to the source", () => {
    const page = source("src/app/(app)/tasks/page.tsx");
    const filters = source("src/components/tasks/task-filters.tsx");

    expect(page).toContain('const personId = valueOf(params, "personId")');
    expect(page).toContain('const relationshipId = valueOf(params, "relationshipId")');
    expect(page).toContain("personId, relationshipId, page, pageSize: 10");
    expect(page).toContain("Retour à la fiche");
    expect(page).toContain("Retour à la relation");
    expect(page).toContain("personId={personId}");
    expect(page).toContain("relationshipId={relationshipId}");
    expect(filters).toContain('name="personId" value={personId}');
    expect(filters).toContain('name="relationshipId" value={relationshipId}');
  });
});
