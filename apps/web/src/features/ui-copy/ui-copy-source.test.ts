import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("visible UI copy", () => {
  it("uses Echanges as the visible interactions label while keeping technical routes stable", () => {
    const shell = source("src/components/app-shell.tsx");
    const interactionsPage = source("src/app/(app)/interactions/page.tsx");

    expect(shell).toContain('{ href: "/interactions", label: "Échanges" }');
    expect(interactionsPage).toContain("<h1>Échanges</h1>");
    expect(interactionsPage).toContain("Nouvel échange");
  });

  it("keeps technical metadata and UUID-like responsibility fields out of standard forms", () => {
    const interactionForm = source("src/components/interactions/interaction-form.tsx");
    const relationshipForm = source("src/components/relationships/relationship-form.tsx");
    const relationshipDetail = source("src/app/(app)/relationships/[id]/page.tsx");
    const projectDetail = source("src/app/(app)/projects/[id]/page.tsx");

    expect(interactionForm).not.toContain("Metadata JSON");
    expect(relationshipForm).not.toContain("Metadata JSON");
    expect(relationshipDetail).not.toContain("<h2>Metadata</h2>");
    expect(projectDetail).toContain("Utilisateur non identifié");
    expect(relationshipDetail).toContain("Utilisateur non identifié");
  });

  it("clarifies the task project field without changing the project attachment control", () => {
    const taskForm = source("src/components/tasks/task-form.tsx");

    expect(taskForm).toContain("Modifier le projet associé");
    expect(taskForm).toContain("Aucun projet");
    expect(taskForm).toContain("Ce champ modifie l'association projet affichée dans le bloc Contexte.");
  });

  it("does not expose common English technical API errors to users", () => {
    const apiSources = [
      "src/app/api/people/route.ts",
      "src/app/api/people/[id]/route.ts",
      "src/app/api/organizations/route.ts",
      "src/app/api/organizations/[id]/route.ts",
      "src/app/api/relationships/route.ts",
      "src/app/api/relationships/[id]/route.ts",
      "src/app/api/interactions/route.ts",
      "src/app/api/interactions/[id]/route.ts",
      "src/app/api/tasks/route.ts",
      "src/app/api/tasks/[id]/route.ts",
      "src/app/api/projects/route.ts",
      "src/app/api/projects/[id]/route.ts"
    ].map(source).join("\n");

    expect(apiSources).not.toContain("Validation failed");
    expect(apiSources).not.toContain("Only owner and admin roles can delete");
    expect(apiSources).toContain("Les informations saisies sont invalides.");
    expect(apiSources).toContain("Suppression réservée aux rôles owner et admin.");
  });
});
