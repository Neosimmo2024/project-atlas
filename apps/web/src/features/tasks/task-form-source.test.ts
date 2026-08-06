import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { projectMatchesTaskContext } from "./project-options";
import type { TaskRelationshipOption } from "@/repositories/tasks";

describe("task form source", () => {
  it("filters project options from the selected person, organization or relationship context", () => {
    const source = readFileSync(join(process.cwd(), "src/components/tasks/task-form.tsx"), "utf8");

    expect(source).toContain("filteredProjectOptions");
    const projectOptionsSource = readFileSync(join(process.cwd(), "src/features/tasks/project-options.ts"), "utf8");

    expect(projectOptionsSource).toContain("project.person_id === context.personId");
    expect(projectOptionsSource).toContain("project.organization_id === context.organizationId");
    expect(projectOptionsSource).toContain("project.relationship_id === context.relationshipId");
    expect(projectOptionsSource).toContain("relationship?.person_id === context.personId");
    expect(projectOptionsSource).toContain("relationship?.organization_id === context.organizationId");
    expect(source).toContain("Aucun projet actif associe au contexte selectionne.");
    expect(source).toContain("Selectionnez d'abord une personne, une organisation ou une relation pour afficher les projets associes.");
  });

  it("clears stale project selection when task context changes", () => {
    const source = readFileSync(join(process.cwd(), "src/components/tasks/task-form.tsx"), "utf8");

    expect(source.match(/setProjectId\(""\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(source).toContain("selectedProjectAvailable");
  });

  it("keeps a project selectable when it is linked through the selected person's relationship", () => {
    const relationships = new Map<string, TaskRelationshipOption>([
      ["relationship-jean", {
        id: "relationship-jean",
        relationship_type: "recruiting",
        pipeline_stage: "presentation",
        person_id: "person-jean",
        organization_id: "organization-a"
      }]
    ]);

    expect(projectMatchesTaskContext({
      id: "project-jean",
      title: "Projet de recrutement Jean test",
      status: "open",
      archived_at: null,
      person_id: null,
      organization_id: null,
      relationship_id: "relationship-jean"
    }, relationships, { personId: "person-jean" })).toBe(true);
  });

  it("allows removing a project attachment by selecting no project", () => {
    const relationships = new Map();

    expect(projectMatchesTaskContext({
      id: "project-closed",
      title: "Projet archive",
      status: "open",
      archived_at: "2026-01-01T00:00:00Z",
      person_id: "person-jean",
      organization_id: null,
      relationship_id: null
    }, relationships, { personId: "person-jean" })).toBe(false);
  });
});
