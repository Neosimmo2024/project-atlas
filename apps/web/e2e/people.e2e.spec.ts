import { expect, test } from "@playwright/test";

const requiredEnv = [
  "PEOPLE_TEST_TENANT_A_EMAIL",
  "PEOPLE_TEST_TENANT_A_PASSWORD"
] as const;

const hasE2eEnv = requiredEnv.every((key) => Boolean(process.env[key]));

test.describe("People authenticated flow", () => {
  test.skip(!hasE2eEnv, "Set PEOPLE_TEST_TENANT_A_EMAIL and PEOPLE_TEST_TENANT_A_PASSWORD locally to run authenticated People E2E.");

  test("login, create, search, edit, duplicate warning, delete, logout", async ({ page }) => {
    const marker = `E2E ${Date.now()}`;

    await page.goto("/login");
    await page.getByLabel("Email").fill(process.env.PEOPLE_TEST_TENANT_A_EMAIL!);
    await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.PEOPLE_TEST_TENANT_A_PASSWORD!);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto("/people");
    await page.getByRole("link", { name: "Nouvelle personne" }).click();
    await page.getByLabel("Prenom").fill("André");
    await page.getByLabel("Nom").fill("O'Connor (test)");
    await page.getByLabel("Nom d'affichage").fill(marker);
    await page.getByLabel("Email").fill(`${marker.toLowerCase().replaceAll(" ", ".")}@example.com`);
    await page.getByLabel("Telephone").fill(`+33${Date.now()}`);
    await page.getByLabel("Ville").fill("L'Haÿ-les-Roses");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page).toHaveURL(/\/people\/[^/]+$/);

    await page.goto(`/people?query=${encodeURIComponent(marker)}`);
    await expect(page.getByText(marker)).toBeVisible();

    await page.getByText(marker).click();
    await page.getByLabel("Commentaires").fill("Updated from E2E");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Updated from E2E")).toBeVisible();

    await page.goto("/people/new");
    await page.getByLabel("Nom d'affichage").fill(`${marker} duplicate`);
    await page.getByLabel("Email").fill(`${marker.toLowerCase().replaceAll(" ", ".")}@example.com`);
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Doublon potentiel detecte")).toBeVisible();

    await page.goto(`/people?query=${encodeURIComponent(marker)}`);
    await page.getByText(marker).click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Supprimer" }).click();
    await expect(page).toHaveURL(/\/people/);

    await page.context().clearCookies();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});
