import { expect, test } from "@playwright/test";

const hasFoundationUiE2EEnv = Boolean(
  process.env.FOUNDATION_UI_E2E_BASE_URL
  && process.env.FOUNDATION_UI_TEST_TENANT_A_EMAIL
  && process.env.FOUNDATION_UI_TEST_TENANT_A_PASSWORD
);

test.skip(!hasFoundationUiE2EEnv, "Foundation UI E2E requires local app URL and authenticated Supabase test credentials.");

test("Projects pages exercise Foundation UI primitives", async ({ page }) => {
  const baseUrl = process.env.FOUNDATION_UI_E2E_BASE_URL ?? "http://127.0.0.1:3000";

  await page.goto(`${baseUrl}/login`);
  await page.getByLabel("Email").fill(process.env.FOUNDATION_UI_TEST_TENANT_A_EMAIL ?? "");
  await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.FOUNDATION_UI_TEST_TENANT_A_PASSWORD ?? "");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.goto(`${baseUrl}/projects`);
  await expect(page.getByRole("heading", { name: "Projets" })).toBeVisible();
  await expect(page.getByLabel("Recherche")).toBeVisible();
  await page.getByLabel("Recherche").fill("qa");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/query=qa/);

  await page.goto(`${baseUrl}/projects/new`);
  await expect(page.getByRole("heading", { name: "Nouveau Projet" })).toBeVisible();
  await expect(page.getByLabel("Titre")).toBeVisible();

  await page.goto(`${baseUrl}/projects`);
  const firstProject = page.locator("a.project-card").first();
  if (await firstProject.count() === 0) test.skip(true, "No project data available to verify detail tabs and confirmations.");
  await firstProject.click();
  await expect(page.getByRole("navigation", { name: "Onglets Projet" })).toBeVisible();
  await page.getByRole("link", { name: "Taches" }).click();
  await expect(page).toHaveURL(/tab=tasks/);

  const archive = page.getByRole("button", { name: "Archiver" });
  if (await archive.count() > 0) {
    await archive.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Annuler" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
});
