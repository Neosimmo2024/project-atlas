import { expect, test } from "@playwright/test";

const requiredEnv = [
  "INTERACTIONS_TEST_TENANT_A_EMAIL",
  "INTERACTIONS_TEST_TENANT_A_PASSWORD"
] as const;

const hasE2eEnv = requiredEnv.every((key) => Boolean(process.env[key]));

test.describe("Interactions authenticated flow", () => {
  test.skip(!hasE2eEnv, "Set INTERACTIONS_TEST_TENANT_A_EMAIL and INTERACTIONS_TEST_TENANT_A_PASSWORD locally to run authenticated Interactions E2E.");

  test("login, create, search, edit, timeline, delete, logout", async ({ page }) => {
    const marker = `Interaction E2E ${Date.now()}`;
    const personName = `${marker} Person`;

    await page.goto("/login");
    await page.getByLabel("Email").fill(process.env.INTERACTIONS_TEST_TENANT_A_EMAIL!);
    await page.getByLabel("Mot de passe").fill(process.env.INTERACTIONS_TEST_TENANT_A_PASSWORD!);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto("/people/new");
    await page.getByLabel("Nom d'affichage").fill(personName);
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page).toHaveURL(/\/people\/[^/]+$/);

    await page.goto("/interactions/new");
    await page.getByLabel("Personne").selectOption({ label: personName });
    await page.getByLabel("Titre").fill(marker);
    await page.getByLabel("Resume").fill("Created from Interactions E2E");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page).toHaveURL(/\/interactions\/[^/]+$/);

    await page.goto(`/interactions?query=${encodeURIComponent(marker)}`);
    await expect(page.getByText(marker)).toBeVisible();

    await page.getByText(marker).click();
    await page.getByLabel("Commentaires").fill("Updated from Interactions E2E");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Updated from Interactions E2E")).toBeVisible();

    await page.goto(`/people?query=${encodeURIComponent(personName)}`);
    await page.getByText(personName).click();
    await expect(page.getByText(marker)).toBeVisible();

    await page.goto(`/interactions?query=${encodeURIComponent(marker)}`);
    await page.getByText(marker).click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Supprimer" }).click();
    await expect(page).toHaveURL(/\/interactions/);

    await page.context().clearCookies();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});
