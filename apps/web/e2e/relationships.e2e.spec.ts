import { expect, test } from "@playwright/test";

const requiredEnv = [
  "RELATIONSHIPS_TEST_TENANT_A_EMAIL",
  "RELATIONSHIPS_TEST_TENANT_A_PASSWORD"
] as const;

const hasE2eEnv = requiredEnv.every((key) => Boolean(process.env[key]));

test.describe("Relationships authenticated flow", () => {
  test.skip(!hasE2eEnv, "Set RELATIONSHIPS_TEST_TENANT_A_EMAIL and RELATIONSHIPS_TEST_TENANT_A_PASSWORD locally to run authenticated Relationships E2E.");

  test("login, create, search, edit, duplicate warning, delete, logout", async ({ page }) => {
    const marker = `Relationship E2E ${Date.now()}`;
    const personName = `${marker} Person`;
    const organizationName = `${marker} Organization`;

    await page.goto("/login");
    await page.getByLabel("Email").fill(process.env.RELATIONSHIPS_TEST_TENANT_A_EMAIL!);
    await page.getByLabel("Mot de passe").fill(process.env.RELATIONSHIPS_TEST_TENANT_A_PASSWORD!);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto("/people/new");
    await page.getByLabel("Nom d'affichage").fill(personName);
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page).toHaveURL(/\/people\/[^/]+$/);

    await page.goto("/organizations/new");
    await page.getByLabel("Nom", { exact: true }).fill(organizationName);
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page).toHaveURL(/\/organizations\/[^/]+$/);

    await page.goto("/relationships/new");
    await page.getByLabel("Personne").selectOption({ label: personName });
    await page.getByLabel("Organisation").selectOption({ label: organizationName });
    await page.getByLabel("Notes").fill(marker);
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page).toHaveURL(/\/relationships\/[^/]+$/);

    await page.goto(`/relationships?query=${encodeURIComponent(marker)}`);
    await expect(page.getByText(personName)).toBeVisible();
    await expect(page.getByText(organizationName)).toBeVisible();

    await page.getByText(personName).click();
    await page.getByLabel("Score").fill("82");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("82")).toBeVisible();

    await page.goto("/relationships/new");
    await page.getByLabel("Personne").selectOption({ label: personName });
    await page.getByLabel("Organisation").selectOption({ label: organizationName });
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Relation active identique detectee")).toBeVisible();

    await page.goto(`/relationships?query=${encodeURIComponent(marker)}`);
    await page.getByText(personName).click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Supprimer" }).click();
    await expect(page).toHaveURL(/\/relationships/);

    await page.context().clearCookies();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});
