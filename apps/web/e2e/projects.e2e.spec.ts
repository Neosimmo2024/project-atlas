import { expect, test } from "@playwright/test";

const requiredEnv = [
  "PROJECTS_TEST_TENANT_A_EMAIL",
  "PROJECTS_TEST_TENANT_A_PASSWORD",
  "QA_PROJECT_B_ID"
] as const;

const hasE2eEnv = requiredEnv.every((key) => Boolean(process.env[key]));

test.describe("Projects authenticated flow", () => {
  test.skip(!hasE2eEnv, "Set local Supabase Projects E2E credentials to run authenticated Projects E2E.");

  test("create, search, filter, edit, transition, tabs, links, and tenant isolation", async ({ page }) => {
    const marker = `Project E2E ${Date.now()}`;

    await page.goto("/login");
    await page.getByLabel("Email").fill(process.env.PROJECTS_TEST_TENANT_A_EMAIL!);
    await page.getByLabel("Mot de passe").fill(process.env.PROJECTS_TEST_TENANT_A_PASSWORD!);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto("/projects");
    await expect(page.getByRole("heading", { name: "Projets" })).toBeVisible();
    await expect(page.getByText("Atlas QA Seed Project A")).toBeVisible();

    await page.goto("/projects/new");
    await page.getByLabel("Titre").fill(marker);
    await page.getByLabel("Description").fill("Created from Projects E2E");
    await page.getByLabel("Valeur estimee").fill("1234.00");
    await page.getByRole("button", { name: "Creer le Projet" }).click();
    await expect(page).toHaveURL(/\/projects\/[^/]+\?projectSaved=1/);
    await expect(page.getByText("Projet cree.")).toBeVisible();

    const projectUrl = page.url().replace(/\?.*$/, "");
    await page.goto(`/projects?query=${encodeURIComponent(marker)}`);
    await expect(page.getByText(marker)).toBeVisible();
    await page.getByLabel("Statut").selectOption("open");
    await page.getByRole("button", { name: "Filtrer" }).click();
    await expect(page).toHaveURL(/status=open/);
    await expect(page.getByText(marker)).toBeVisible();

    await page.goto(projectUrl);
    await expect(page.getByRole("navigation", { name: "Onglets Projet" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Taches" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Echanges" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Historique" })).toBeVisible();

    await page.getByLabel("Titre").fill(`${marker} updated`);
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page).toHaveURL(/projectSaved=1/);
    await expect(page.getByRole("heading", { name: `${marker} updated` })).toBeVisible();

    await page.getByRole("button", { name: "Changer etape" }).click();
    const stageForm = page.locator("form").filter({ hasText: "Changer etape du Projet" });
    await stageForm.getByLabel("Etape").selectOption("proposal");
    await stageForm.getByRole("button", { name: "Valider" }).click();
    await expect(page.getByText("Etape mise a jour.")).toBeVisible();

    await page.getByRole("button", { name: "Marquer comme gagne" }).click();
    const winForm = page.locator("form").filter({ hasText: "Marquer ce Projet comme gagne" });
    await winForm.getByLabel("Valeur finale").fill("1500.00");
    await winForm.getByRole("button", { name: "Confirmer le gain" }).click();
    await expect(page.getByText("Projet marque comme gagne.")).toBeVisible();

    await page.goto(`${projectUrl}?tab=tasks`);
    await expect(page).toHaveURL(/tab=tasks/);
    await page.goto(`${projectUrl}?tab=interactions`);
    await expect(page).toHaveURL(/tab=interactions/);
    await page.goto(`${projectUrl}?tab=history`);
    await expect(page).toHaveURL(/tab=history/);

    await page.goto("/projects/".concat(process.env.QA_PROJECT_B_ID!));
    await expect(page.getByText(/404|not found|introuvable/i)).toBeVisible();
  });
});
