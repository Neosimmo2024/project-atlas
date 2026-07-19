import { expect, test } from "@playwright/test";

const requiredEnv = [
  "ORGANIZATIONS_TEST_TENANT_A_EMAIL",
  "ORGANIZATIONS_TEST_TENANT_A_PASSWORD"
] as const;

const hasE2eEnv = requiredEnv.every((key) => Boolean(process.env[key]));

test.describe("Organizations authenticated flow", () => {
  test.skip(!hasE2eEnv, "Set ORGANIZATIONS_TEST_TENANT_A_EMAIL and ORGANIZATIONS_TEST_TENANT_A_PASSWORD locally to run authenticated Organizations E2E.");

  test("login, create, search, edit, duplicate warning, parent, delete, logout", async ({ page }) => {
    const marker = `Org E2E ${Date.now()}`;
    const parentName = `${marker} Parent`;
    const childName = `${marker} Child`;

    await page.goto("/login");
    await page.getByLabel("Email").fill(process.env.ORGANIZATIONS_TEST_TENANT_A_EMAIL!);
    await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.ORGANIZATIONS_TEST_TENANT_A_PASSWORD!);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto("/organizations/new");
    await page.getByLabel("Nom", { exact: true }).fill(parentName);
    await page.getByLabel("Ville").fill("Paris");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page).toHaveURL(/\/organizations\/[^/]+$/);

    await page.goto("/organizations/new");
    await page.getByLabel("Nom", { exact: true }).fill(childName);
    await page.getByLabel("Email").fill(`${marker.toLowerCase().replaceAll(" ", ".")}@example.com`);
    await page.getByLabel("SIREN").fill("123 456 789");
    await page.getByLabel("Reseau parent eventuel").selectOption({ label: parentName });
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page).toHaveURL(/\/organizations\/[^/]+$/);

    await page.goto(`/organizations?query=${encodeURIComponent(childName)}`);
    await expect(page.getByText(childName)).toBeVisible();

    await page.getByText(childName).click();
    await page.getByLabel("Commentaires").fill("Updated from Organizations E2E");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Updated from Organizations E2E")).toBeVisible();
    await expect(page.getByText(parentName)).toBeVisible();

    await page.goto("/organizations/new");
    await page.getByLabel("Nom", { exact: true }).fill(`${childName} duplicate`);
    await page.getByLabel("Email").fill(`${marker.toLowerCase().replaceAll(" ", ".")}@example.com`);
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Doublon potentiel detecte")).toBeVisible();

    await page.goto(`/organizations?query=${encodeURIComponent(childName)}`);
    await page.getByText(childName).click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Supprimer" }).click();
    await expect(page).toHaveURL(/\/organizations/);

    await page.goto(`/organizations?query=${encodeURIComponent(parentName)}`);
    await page.getByText(parentName).click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Supprimer" }).click();
    await expect(page).toHaveURL(/\/organizations/);

    await page.context().clearCookies();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});
