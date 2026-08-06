import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("task form source", () => {
  it("filters project options from the selected person, organization or relationship context", () => {
    const source = readFileSync(join(process.cwd(), "src/components/tasks/task-form.tsx"), "utf8");

    expect(source).toContain("filteredProjectOptions");
    expect(source).toContain("project.person_id === personId");
    expect(source).toContain("project.organization_id === organizationId");
    expect(source).toContain("project.relationship_id === relationshipId");
    expect(source).toContain("Aucun projet actif associe au contexte selectionne.");
    expect(source).toContain("Selectionnez d'abord une personne, une organisation ou une relation pour afficher les projets associes.");
  });

  it("clears stale project selection when task context changes", () => {
    const source = readFileSync(join(process.cwd(), "src/components/tasks/task-form.tsx"), "utf8");

    expect(source.match(/setProjectId\(""\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(source).toContain("selectedProjectAvailable");
  });
});

