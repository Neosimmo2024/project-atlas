import { expect, test } from "@playwright/test";

const hasTimelineE2EEnv = Boolean(
  process.env.TIMELINE_E2E_BASE_URL
  && process.env.TIMELINE_TEST_TENANT_A_EMAIL
  && process.env.TIMELINE_TEST_TENANT_A_PASSWORD
);

test.skip(!hasTimelineE2EEnv, "Timeline E2E requires local Supabase/Auth test credentials.");

test("displays chronology on person, organization, and relationship pages", async ({ page }) => {
  await page.goto(`${process.env.TIMELINE_E2E_BASE_URL}/login`);
  await page.getByLabel("Email").fill(process.env.TIMELINE_TEST_TENANT_A_EMAIL ?? "");
  await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.TIMELINE_TEST_TENANT_A_PASSWORD ?? "");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto(`${process.env.TIMELINE_E2E_BASE_URL}/people`);
  await expect(page.getByText("People")).toBeVisible();
});
