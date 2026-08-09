import { expect, test, type Page } from "@playwright/test";

const ownerEnv = Boolean(
  process.env.FOUNDATION_UI_E2E_BASE_URL
  && process.env.TENANT_ADMIN_OWNER_EMAIL
  && process.env.TENANT_ADMIN_OWNER_PASSWORD
);

const adminEnv = Boolean(
  process.env.FOUNDATION_UI_E2E_BASE_URL
  && process.env.TENANT_ADMIN_ADMIN_EMAIL
  && process.env.TENANT_ADMIN_ADMIN_PASSWORD
);

async function signIn(page: Page, email: string, password: string) {
  const baseUrl = process.env.FOUNDATION_UI_E2E_BASE_URL ?? "http://127.0.0.1:3000";
  await page.goto(`${baseUrl}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe("Tenant administration", () => {
  test("owner can open the team administration page on desktop and mobile", async ({ page }) => {
    test.skip(!ownerEnv, "Tenant administration owner E2E requires QA owner credentials.");

    await signIn(page, process.env.TENANT_ADMIN_OWNER_EMAIL!, process.env.TENANT_ADMIN_OWNER_PASSWORD!);
    await page.getByRole("link", { name: "Administration de l’équipe" }).click();
    await expect(page).toHaveURL(/\/admin\/team/);
    await expect(page.getByRole("heading", { name: "Administration de l’équipe" })).toBeVisible();
    await expect(page.getByText("Tenant actif")).toBeVisible();
    await expect(page.getByText(/Actif|Suspendu|Invité/)).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("heading", { name: "Administration de l’équipe" })).toBeVisible();
    await expect(page.getByText("Tenant actif")).toBeVisible();
  });

  test("admin can open the team administration page without owner role choices", async ({ page }) => {
    test.skip(!adminEnv, "Tenant administration admin E2E requires QA admin credentials.");

    await signIn(page, process.env.TENANT_ADMIN_ADMIN_EMAIL!, process.env.TENANT_ADMIN_ADMIN_PASSWORD!);
    await page.getByRole("link", { name: "Administration de l’équipe" }).click();
    await expect(page).toHaveURL(/\/admin\/team/);
    await expect(page.getByRole("heading", { name: "Administration de l’équipe" })).toBeVisible();
    await expect(page.locator("select option", { hasText: "Propriétaire" })).toHaveCount(0);
  });
});
