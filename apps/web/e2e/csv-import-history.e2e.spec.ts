import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

const requiredEnv = [
  "CSV_IMPORT_E2E_BASE_URL",
  "PROJECTS_TEST_TENANT_A_EMAIL",
  "PROJECTS_TEST_TENANT_A_PASSWORD",
  "QA_ORGANIZATION_A_ID"
] as const;

const hasCsvImportE2EEnv = requiredEnv.every((key) => Boolean(process.env[key]));
const fixturePath = join(process.cwd(), "..", "..", "docs", "fixtures", "sprint13", "demo-import.csv");

test.skip(!hasCsvImportE2EEnv, "CSV import visual E2E requires local Supabase/Auth test credentials.");

test("Sprint 13 CSV visual recipe imports to organizations and pipeline then cancels safely", async ({
  page
}, testInfo) => {
  const csvBuffer = readFileSync(fixturePath);

  await login(page);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/imports");
  await expect(page.getByRole("heading", { name: "Importer des contacts" })).toBeVisible();
  await expectNoMojibake(page);
  await capture(page, testInfo, "sprint13-csv-desktop-01-import-initial");

  await page.locator('input[type="file"]').setInputFiles({
    name: "sprint13-demo-import.csv",
    mimeType: "text/csv",
    buffer: csvBuffer
  });

  await expect(page.getByText("sprint13-demo-import.csv")).toBeVisible();
  await expect(page.getByText("Prénom")).toBeVisible();
  await expect(page.getByText("Téléphone")).toBeVisible();
  await expect(page.getByText("Statut TVA")).toBeVisible();
  await expect(page.getByText("Élodie")).toBeVisible();
  await expectNoMojibake(page);
  await capture(page, testInfo, "sprint13-csv-desktop-02-preview-mapping");

  await page.getByRole("button", { name: "Valider et vérifier" }).click();
  await expect(page.getByRole("heading", { name: "Vérification et doublons détectés" })).toBeVisible();
  await expect(page.getByText("Statut TVA non reconnu")).toBeVisible();
  await expect(page.getByText("À vérifier")).toBeVisible();
  await expect(page.getByText("Nora")).toBeVisible();
  await expect(page.getByText("Incomplete")).toBeVisible();
  await expectNoMojibake(page);
  await resolveRequiredDecisions(page);
  await capture(page, testInfo, "sprint13-csv-desktop-03-review-vat-warning");

  await page.getByLabel(/Ajouter les contacts .* pipeline/i).check();
  await expect(page.getByText("Option globale")).toBeVisible();
  await page.getByRole("button", { name: /Pr[eé]parer la suite/ }).click();
  await expect(page.getByText("Import prêt à exécuter")).toBeVisible();
  await expect(page.getByText("Relations créées")).toBeVisible();
  await expectNoMojibake(page);
  await capture(page, testInfo, "sprint13-csv-desktop-04-summary-before-import");

  await page.getByRole("button", { name: "Confirmer et lancer l'import" }).click();
  await expect(page.getByText(/Import termin/i)).toBeVisible({ timeout: 30000 });
  await expect(page.getByText("Les écritures validées ont été appliquées")).toBeVisible();
  await expect(page.getByText("Personnes créées")).toBeVisible();
  await expect(page.getByText("Organisations créées")).toBeVisible();
  await expectNoMojibake(page);
  await capture(page, testInfo, "sprint13-csv-desktop-05-result-after-import");

  await page.goto("/imports");
  await expect(page.getByRole("heading", { name: "Imports CSV exécutés" })).toBeVisible();
  await expect(page.getByText("sprint13-demo-import.csv")).toBeVisible();
  await expectNoMojibake(page);
  await capture(page, testInfo, "sprint13-csv-desktop-06-history");

  await page.getByRole("link", { name: /Consulter le d[eé]tail/ }).first().click();
  await expect(page.getByRole("heading", { name: /Import CSV|sprint13-demo-import\.csv/i })).toBeVisible();
  await expect(page.getByText("Statut TVA: Assujetti")).toBeVisible();
  await expect(page.getByText("Statut TVA: À vérifier")).toBeVisible();
  await expect(page.getByText(/Annulation s[eé]curis[eé]e/)).toBeVisible();
  await expectNoMojibake(page);
  const detailUrl = page.url();
  await capture(page, testInfo, "sprint13-csv-desktop-07-detail");

  await page.goto("/organizations?query=Atlas%20D%C3%A9mo%20Nouvelle%20Agence");
  await expect(page.getByRole("link", { name: /Atlas Démo Nouvelle Agence/ })).toBeVisible();
  await page.getByRole("link", { name: /Atlas Démo Nouvelle Agence/ }).first().click();
  await expect(page.getByText("Statut TVA")).toBeVisible();
  await expect(page.getByText("Assujetti")).toBeVisible();
  await expectNoMojibake(page);
  await capture(page, testInfo, "sprint13-csv-desktop-08-organization-vat-status");

  await page.goto("/pipeline?query=%C3%89lodie%20Carpentier");
  await expect(page.getByText("Élodie Carpentier")).toBeVisible();
  await expect(page.getByText("Atlas Démo Nouvelle Agence")).toBeVisible();
  await expectNoMojibake(page);
  await capture(page, testInfo, "sprint13-csv-desktop-09-pipeline-after-import");

  await page.goto("/pipeline?query=Hugo%20Lambert");
  await expect(page.getByText("Aucune relation dans le pipeline")).toBeVisible();

  await page.goto(detailUrl);
  await page.getByRole("button", { name: "Demander l'annulation" }).click();
  await expect(page.getByRole("dialog", { name: "Confirmer l'annulation de l'import" })).toBeVisible();
  await page.getByLabel(/Je confirme vouloir lancer/).check();
  await page.getByRole("button", { name: "Valider l'annulation" }).click();
  await expect(page.getByText(/donn[eé]e\(s\) supprim[eé]e\(s\)/)).toBeVisible({ timeout: 30000 });
  await expect(page.getByText(/conserv[eé]e\(s\)/)).toBeVisible();
  await expectNoMojibake(page);
  await capture(page, testInfo, "sprint13-csv-desktop-10-after-cancellation");

  await page.goto(`/organizations/${process.env.QA_ORGANIZATION_A_ID}`);
  await expect(page.getByText("Atlas QA Organization A")).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/imports");
  await expect(page.getByRole("heading", { name: "Importer des contacts" })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: "sprint13-demo-import-mobile.csv",
    mimeType: "text/csv",
    buffer: csvBuffer
  });
  await expect(page.getByText("Statut TVA")).toBeVisible();
  await expectNoBlockingHorizontalOverflow(page);
  await expectNoMojibake(page);
  await capture(page, testInfo, "sprint13-csv-mobile-01-preview-mapping");

  await page.getByRole("button", { name: "Valider et vérifier" }).click();
  await expect(page.getByText("Statut TVA non reconnu")).toBeVisible();
  await resolveRequiredDecisions(page);
  await expectNoBlockingHorizontalOverflow(page);
  await capture(page, testInfo, "sprint13-csv-mobile-02-review-warnings");

  await page.getByLabel(/Ajouter les contacts .* pipeline/i).check();
  await page.getByRole("button", { name: /Pr[eé]parer la suite/ }).click();
  await expect(page.getByText("Import prêt à exécuter")).toBeVisible();
  await expectNoBlockingHorizontalOverflow(page);
  await capture(page, testInfo, "sprint13-csv-mobile-03-summary");

  await page.getByRole("button", { name: "Confirmer et lancer l'import" }).click();
  await expect(page.getByText(/Import termin/i)).toBeVisible({ timeout: 30000 });
  await expectNoBlockingHorizontalOverflow(page);
  await capture(page, testInfo, "sprint13-csv-mobile-04-result");

  await page.goto("/imports");
  await expect(page.getByText("sprint13-demo-import-mobile.csv")).toBeVisible();
  await expectNoBlockingHorizontalOverflow(page);
  await capture(page, testInfo, "sprint13-csv-mobile-05-history");

  await page.getByRole("link", { name: /Consulter le d[eé]tail/ }).first().click();
  await expect(page.getByText("Statut TVA: Assujetti")).toBeVisible();
  await expectNoBlockingHorizontalOverflow(page);
  const mobileDetailUrl = page.url();
  await capture(page, testInfo, "sprint13-csv-mobile-06-detail-vat");

  await page.goto("/pipeline?query=%C3%89lodie%20Carpentier");
  await expect(page.getByText("Élodie Carpentier")).toBeVisible();
  await expectNoBlockingHorizontalOverflow(page);
  await capture(page, testInfo, "sprint13-csv-mobile-07-pipeline");

  await page.goto(mobileDetailUrl);
  await page.getByRole("button", { name: "Demander l'annulation" }).click();
  await page.getByLabel(/Je confirme vouloir lancer/).check();
  await page.getByRole("button", { name: "Valider l'annulation" }).click();
  await expect(page.getByText(/donn[eé]e\(s\) supprim[eé]e\(s\)/)).toBeVisible({ timeout: 30000 });
  await expectNoBlockingHorizontalOverflow(page);
  await capture(page, testInfo, "sprint13-csv-mobile-08-after-cancellation");
});

async function login(page: Page) {
  await page.goto(`${process.env.CSV_IMPORT_E2E_BASE_URL}/login`);
  await page.getByLabel("Email").fill(process.env.PROJECTS_TEST_TENANT_A_EMAIL ?? "");
  await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.PROJECTS_TEST_TENANT_A_PASSWORD ?? "");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function resolveRequiredDecisions(page: Page) {
  await page.locator(".import-review-row").evaluateAll((rows) => {
    for (const row of rows) {
      const select = row.querySelector<HTMLSelectElement>("select");
      if (!select || select.disabled || select.value) continue;
      const text = row.textContent ?? "";
      select.value = /Ligne invalide|Nora|Incomplete/i.test(text) ? "ignore_row" : "review_later";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  await expect(page.locator(".import-validation-errors")).toHaveCount(0);
}

async function expectNoMojibake(page: Page) {
  const text = await page.locator("body").innerText();
  expect(text).not.toMatch(/Ã|Â|â€™|â€“|â€œ|â€|�/);
}

async function expectNoBlockingHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(2);
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath("pipeline-visual-qa", `${name}.png`);
  mkdirSync(dirname(path), { recursive: true });
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: "image/png" });
}
