import { expect, test } from "@playwright/test";

const hasCsvImportE2EEnv = Boolean(
  process.env.CSV_IMPORT_E2E_BASE_URL
  && process.env.PROJECTS_TEST_TENANT_A_EMAIL
  && process.env.PROJECTS_TEST_TENANT_A_PASSWORD
);

test.skip(!hasCsvImportE2EEnv, "CSV import history E2E requires local Supabase/Auth test credentials.");

test("imports history and cancellation detail stay readable without destructive actions", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${process.env.CSV_IMPORT_E2E_BASE_URL}/login`);
  await page.getByLabel("Email").fill(process.env.PROJECTS_TEST_TENANT_A_EMAIL ?? "");
  await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.PROJECTS_TEST_TENANT_A_PASSWORD ?? "");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.goto(`${process.env.CSV_IMPORT_E2E_BASE_URL}/imports`);
  await expect(page.getByRole("heading", { name: "Importer des contacts" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Imports CSV exécutés" })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: "pipeline-option.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("First,Last,Email,Organization\nAda,Lovelace,ada-import-e2e@example.test,Atlas Test\n")
  });
  await page.getByRole("button", { name: "Valider et vérifier" }).click();
  await expect(page.getByText("Ajouter les contacts éligibles au pipeline de recrutement")).toBeVisible();
  await expect(page.getByText("Option globale")).toBeVisible();

  const detailLink = page.getByRole("link", { name: "Consulter le detail" }).first();
  if (await detailLink.count()) {
    await detailLink.click();
    await expect(page.getByRole("heading", { name: /Import CSV|\.csv/i })).toBeVisible();
    await expect(page.getByText("Annulation sécurisée")).toBeVisible();
    await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
  }
});
