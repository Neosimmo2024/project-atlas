import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("central action plan page source", () => {
  it("adds a dedicated navigation entry without renaming technical routes", () => {
    const shell = source("src/components/app-shell.tsx");
    const page = source("src/app/(app)/action-plan/page.tsx");

    expect(shell).toContain('{ href: "/action-plan", label: "Plan d’action" }');
    expect(page).toContain("ActionPlanPageClient");
    expect(page).toContain("listActionPlanOrganizations");
  });

  it("keeps the action plan scoped to one selected organization", () => {
    const component = source("src/components/action-plan/action-plan-page-client.tsx");
    const repository = source("src/repositories/action-plan.ts");

    expect(component).toContain("selectedOrganizationId");
    expect(component).toContain("/api/action-plan?organizationId=");
    expect(component).not.toContain("/api/action-plan\"");
    expect(repository).toContain(".eq(\"tenant_id\", context.tenantId)");
    expect(repository).toContain(".eq(\"organization_id\", request.organizationId)");
  });

  it("renders loading, error, empty and read-only states in French", () => {
    const component = source("src/components/action-plan/action-plan-page-client.tsx");

    expect(component).toContain("Chargement du Plan d’action");
    expect(component).toContain("Impossible de charger le Plan d’action");
    expect(component).toContain("Sélectionnez une organisation");
    expect(component).toContain("Aucune recommandation");
    expect(component).toContain("Lecture seule");
  });

  it("does not expose mutating recommendation actions in the consultative page", () => {
    const component = source("src/components/action-plan/action-plan-page-client.tsx");

    expect(component).not.toContain("Terminer");
    expect(component).not.toContain("Reporter");
    expect(component).not.toContain("Ignorer");
    expect(component).not.toContain("Convertir");
    expect(component).toContain("actionPlanItemLinkLabel(item)");
  });
});
