import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("tenant administration page source", () => {
  it("adds an owner/admin-only navigation entry and a protected page", () => {
    const shell = source("src/components/app-shell.tsx");
    const page = source("src/app/(app)/admin/team/page.tsx");

    expect(shell).toContain("/admin/team");
    expect(shell).toContain("Administration de l’équipe");
    expect(shell).toContain("account?.role === \"owner\"");
    expect(shell).toContain("account?.role === \"admin\"");
    expect(page).toContain("canAccessTenantAdministration");
    expect(page).toContain("Accès non autorisé");
  });

  it("does not introduce invitation, auth admin, service-role browser or tenant switching UI", () => {
    const component = source("src/components/tenant-admin/tenant-team-admin.tsx");
    const repository = source("src/repositories/tenant-admin.ts");

    expect(component).not.toMatch(/createUser|auth\.admin/i);
    expect(component).toContain("Les invitations existantes sont affichées mais ne sont pas gérées");
    expect(component).not.toContain("tenant_id");
    expect(repository).not.toContain("service-role");
    expect(repository).not.toContain("auth.admin");
    expect(source("src/app/api/admin/team/[userId]/route.ts")).toContain("getTenantContext");
  });

  it("renders loading-ready controls, success and error messages for desktop and mobile", () => {
    const component = source("src/components/tenant-admin/tenant-team-admin.tsx");
    const styles = source("src/app/globals.css");

    expect(component).toContain("L’équipe a été mise à jour.");
    expect(component).toContain("aria-live=\"polite\"");
    expect(component).toContain("Suspendre");
    expect(component).toContain("Réactiver");
    expect(styles).toContain(".tenant-admin-member-card");
    expect(styles).toContain("@media (max-width: 760px)");
  });
});
