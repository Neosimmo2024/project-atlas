import { expect, test } from "@playwright/test";

const hasActionPlanE2EEnv = Boolean(
  process.env.FOUNDATION_UI_E2E_BASE_URL
  && process.env.FOUNDATION_UI_TEST_TENANT_A_EMAIL
  && process.env.FOUNDATION_UI_TEST_TENANT_A_PASSWORD
);

test.skip(!hasActionPlanE2EEnv, "Action Plan E2E requires local app URL and authenticated Supabase test credentials.");

test("Action Plan central page remains consultative and scoped to one organization", async ({ page }) => {
  const baseUrl = process.env.FOUNDATION_UI_E2E_BASE_URL ?? "http://127.0.0.1:3000";

  await page.goto(`${baseUrl}/login`);
  await page.getByLabel("Email").fill(process.env.FOUNDATION_UI_TEST_TENANT_A_EMAIL ?? "");
  await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.FOUNDATION_UI_TEST_TENANT_A_PASSWORD ?? "");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole("link", { name: "Plan d’action" }).click();
  await expect(page).toHaveURL(/\/action-plan/);
  await expect(page.getByRole("heading", { name: "Plan d’action" })).toBeVisible();
  await expect(page.getByLabel("Organisation")).toBeVisible();

  const organizationSelect = page.getByLabel("Organisation");
  const options = organizationSelect.locator("option");
  if (await options.count() < 2) test.skip(true, "No organization data available to verify the Action Plan selector.");

  const organizationId = await options.nth(1).getAttribute("value");
  expect(organizationId).toBeTruthy();
  await organizationSelect.selectOption(organizationId ?? "");
  await expect(page).toHaveURL(/organizationId=/);

  await expect(page.getByText("Lecture seule")).toBeVisible();
  await expect(page.getByRole("button", { name: /Terminer|Reporter|Ignorer|Convertir/ })).toHaveCount(0);
  await expect(page.getByText(/recommandation|Aucune recommandation/)).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "Plan d’action" })).toBeVisible();
  await expect(page.getByLabel("Organisation")).toBeVisible();
  await expect(page.getByText("Lecture seule")).toBeVisible();
});
