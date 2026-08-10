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
  const projectSearch = page.getByPlaceholder("Titre, description, note");
  await expect(projectSearch).toBeVisible();
  await projectSearch.fill("qa");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/query=qa/);

  await page.goto(`${baseUrl}/projects/new`);
  await expect(page.getByRole("heading", { name: "Nouveau Projet" })).toBeVisible();
  await expect(page.getByLabel("Titre")).toBeVisible();

  await page.goto(`${baseUrl}/projects`);
  const firstProject = page.locator("a.project-card").first();
  if (await firstProject.count() === 0) test.skip(true, "No project data available to verify detail tabs and confirmations.");
  await firstProject.click();
  const projectTabs = page.getByRole("navigation", { name: "Onglets Projet" });
  await expect(projectTabs).toBeVisible();
  await expect(projectTabs.getByRole("link", { name: "Vue d’ensemble" })).toBeVisible();
  await expect(projectTabs.getByRole("link", { name: /T[aâ]ches/ })).toBeVisible();
  await expect(projectTabs.getByRole("link", { name: "Échanges" })).toBeVisible();
  await expect(projectTabs.getByRole("link", { name: "Historique" })).toBeVisible();
  await expectProjectTabsAreSeparated(projectTabs);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(projectTabs).toBeVisible();
  await expectProjectTabsAreSeparated(projectTabs);
  await page.setViewportSize({ width: 1280, height: 900 });
  await projectTabs.getByRole("link", { name: /T[aâ]ches/ }).click();
  await expect(page).toHaveURL(/tab=tasks/);

  const archive = page.getByRole("button", { name: "Archiver" });
  if (await archive.count() > 0) {
    await archive.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Annuler" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
});

async function expectProjectTabsAreSeparated(projectTabs: import("@playwright/test").Locator) {
  const links = projectTabs.getByRole("link");
  const count = await links.count();
  expect(count).toBeGreaterThanOrEqual(4);

  for (let index = 0; index < Math.min(count - 1, 3); index += 1) {
    const current = await links.nth(index).boundingBox();
    const next = await links.nth(index + 1).boundingBox();
    expect(current).not.toBeNull();
    expect(next).not.toBeNull();
    expect(next!.x - (current!.x + current!.width)).toBeGreaterThanOrEqual(4);
  }
}
