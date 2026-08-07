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

  it("uses French labels for primary navigation and People headings", () => {
    const shell = source("src/components/app-shell.tsx");
    const dashboardPage = source("src/app/(app)/dashboard/page.tsx");
    const peoplePage = source("src/app/(app)/people/page.tsx");

    expect(shell).toContain('{ href: "/dashboard", label: "Tableau de bord" }');
    expect(shell).toContain('{ href: "/people", label: "Personnes" }');
    expect(shell).toContain('{ href: "/organizations", label: "Organisations" }');
    expect(shell).toContain('{ href: "/projects", label: "Projets" }');
    expect(dashboardPage).toContain("<h1>Tableau de bord</h1>");
    expect(peoplePage).toContain("Base de talents");
    expect(peoplePage).toContain("<h1>Personnes</h1>");
    expect(peoplePage).not.toContain("Talent database");
  });

  it("keeps People table contact columns readable without overlapping adjacent cells", () => {
    const peoplePage = source("src/app/(app)/people/page.tsx");
    const styles = source("src/app/globals.css");

    expect(peoplePage).toContain('className="cell-email"');
    expect(peoplePage).toContain('className="cell-phone"');
    expect(styles).toContain(".table-head > span, .table-row > span { min-width: 0; overflow-wrap: anywhere; }");
    expect(styles).toContain("minmax(240px, 1.45fr)");
    expect(styles).toContain("min-width: 1280px;");
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

  it("uses French relationship labels in the interaction form selector", () => {
    const interactionForm = source("src/components/interactions/interaction-form.tsx");

    expect(interactionForm).toContain("relationshipLabel(relationship)");
    expect(interactionForm).toContain("RELATIONSHIP_TYPE_LABELS");
    expect(interactionForm).toContain("RELATIONSHIP_PIPELINE_STAGE_LABELS");
    expect(interactionForm).not.toContain("{relationship.relationship_type} - {relationship.pipeline_stage}");
  });

  it("keeps the new interaction back link scoped to the originating project when present", () => {
    const newInteractionPage = source("src/app/(app)/interactions/new/page.tsx");

    expect(newInteractionPage).toContain('const returnHref = defaults.project_id ? `/projects/${defaults.project_id}?tab=interactions` : "/interactions";');
    expect(newInteractionPage).toContain('href={returnHref}');
    expect(newInteractionPage).not.toContain('href="/interactions">Retour</Link>');
  });

  it("keeps project history filters and pagination scoped to the History tab", () => {
    const projectTabs = source("src/components/projects/project-tabs.tsx");
    const timelineList = source("src/components/timeline/timeline-list.tsx");

    expect(projectTabs).toContain('const historyHiddenFields = { tab: "history" };');
    expect(projectTabs).toContain("hiddenFields={historyHiddenFields}");
    expect(timelineList).toContain("hiddenFields?: Record<string, string>;");
    expect(timelineList).toContain("new URLSearchParams({ ...hiddenFields, timelineCategory: category, timelinePage: String(page) })");
  });

  it("clarifies the task project field without changing the project attachment control", () => {
    const taskForm = source("src/components/tasks/task-form.tsx");

    expect(taskForm).toContain("Modifier le projet associé");
    expect(taskForm).toContain("Aucun projet");
    expect(taskForm).toContain("Ce champ modifie l'association projet affichée dans le bloc Contexte.");
  });

  it("keeps project detail tabs separated and uses French project action labels", () => {
    const projectTabs = source("src/components/projects/project-tabs.tsx");
    const projectForm = source("src/components/projects/project-form.tsx");
    const projectActions = source("src/components/projects/project-actions.tsx");
    const styles = source("src/app/globals.css");

    expect(projectTabs).toContain("Vue d’ensemble");
    expect(projectTabs).toContain("RELATIONSHIP_TYPE_LABELS");
    expect(projectTabs).toContain("RELATIONSHIP_PIPELINE_STAGE_LABELS");
    expect(projectTabs).not.toContain("Vue ensemble");
    expect(projectActions).toContain("Changer d’étape");
    expect(projectActions).not.toContain("Changer étape");
    expect(projectForm).toContain("relationshipLabel(relationship)");
    expect(projectForm).toContain("RELATIONSHIP_TYPE_LABELS");
    expect(projectForm).toContain("RELATIONSHIP_PIPELINE_STAGE_LABELS");
    expect(projectForm).not.toContain("{relationship.relationship_type} - {relationship.pipeline_stage}");
    expect(styles).toContain(".tabs {");
    expect(styles).toContain("gap: 8px;");
    expect(styles).toContain(".tabs a.active");
  });

  it("uses French relationship type labels in timeline items instead of raw technical values", () => {
    const timelineItem = source("src/components/timeline/timeline-item.tsx");

    expect(timelineItem).toContain("RELATIONSHIP_TYPE_LABELS");
    expect(timelineItem).toContain("relationshipTypeLabel(event.relationship.relationship_type)");
    expect(timelineItem).toContain('userFacingTimelineText(event.description)');
    expect(timelineItem).not.toContain("label: event.relationship.relationship_type");
  });

  it("uses French labels for task headings and project next action priority", () => {
    const taskSources = [
      "src/app/(app)/tasks/page.tsx",
      "src/app/(app)/tasks/new/page.tsx",
      "src/app/(app)/tasks/[id]/page.tsx"
    ].map(source).join("\n");
    const projectNextAction = source("src/components/projects/project-next-action.tsx");

    expect(taskSources).toContain("Tâches intelligentes");
    expect(taskSources).not.toContain("Smart Tasks");
    expect(projectNextAction).toContain("TASK_PRIORITY_LABELS");
    expect(projectNextAction).not.toContain("Priorité : {action.priority}");
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
