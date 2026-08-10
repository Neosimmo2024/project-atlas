import { expect, test, type Page } from "@playwright/test";

const hasEnv = Boolean(
  process.env.FOUNDATION_UI_E2E_BASE_URL
  && process.env.GLOBAL_SEARCH_E2E_EMAIL
  && process.env.GLOBAL_SEARCH_E2E_PASSWORD
);

async function signIn(page: Page) {
  const baseUrl = process.env.FOUNDATION_UI_E2E_BASE_URL ?? "http://127.0.0.1:3000";
  await page.goto(`${baseUrl}/login`);
  await page.getByLabel("Email").fill(process.env.GLOBAL_SEARCH_E2E_EMAIL!);
  await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.GLOBAL_SEARCH_E2E_PASSWORD!);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe("Global search", () => {
  test("searches from the permanent field and keeps the mobile UI readable", async ({ page }) => {
    test.skip(!hasEnv, "Global search E2E requires QA credentials and seeded searchable data.");

    await signIn(page);
    await page.getByRole("searchbox", { name: "Recherche" }).fill("atlas");
    await expect(page.getByRole("heading", { name: "Personnes" }).or(page.getByRole("heading", { name: "Organisations" }))).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("searchbox", { name: "Recherche" }).fill("zz-no-result-qa");
    await expect(page.getByText("Aucun resultat trouve.")).toBeVisible();
  });
});

