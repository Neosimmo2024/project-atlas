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

  await expectBodyText(page, "sprint13-demo-import.csv");
  await expectBodyText(page, "Prénom");
  await expectBodyText(page, "Téléphone");
  await expectBodyText(page, "Statut TVA");
  await expectBodyText(page, "Élodie");
  await expectNoMojibake(page);
  await capture(page, testInfo, "sprint13-csv-desktop-02-preview-mapping");

  await page.getByRole("button", { name: "Valider et vérifier" }).click();
  await expect(page.getByRole("heading", { name: "Vérification et doublons détectés" })).toBeVisible();
  await expectBodyText(page, "Statut TVA non reconnu");
  await expectBodyText(page, "À vérifier");
  await expectBodyText(page, "Nora");
  await expectBodyText(page, "Incomplete");
  await expectNoMojibake(page);
  await resolveRequiredDecisions(page);
  await capture(page, testInfo, "sprint13-csv-desktop-03-review-vat-warning");

  await page.getByLabel(/Ajouter les contacts .* pipeline/i).check();
  await expectBodyText(page, "Option globale");
  await page.getByRole("button", { name: /Pr[eé]parer la suite/ }).click();
  await expectBodyText(page, "Import prêt à exécuter");
  await expectBodyText(page, "Relations créées");
  await expectNoMojibake(page);
  await capture(page, testInfo, "sprint13-csv-desktop-04-summary-before-import");

  await page.getByRole("button", { name: "Confirmer et lancer l'import" }).click();
  await expect(page.locator("body")).toContainText(/Import termin/i, { timeout: 30000 });
  await expectBodyText(page, "Les écritures validées ont été appliquées");
  await expectBodyText(page, "Personnes créées");
  await expectBodyText(page, "Organisations créées");
  await expectNoMojibake(page);
  await capture(page, testInfo, "sprint13-csv-desktop-05-result-after-import");

  await page.goto("/imports");
  await expect(page.getByRole("heading", { name: "Imports CSV exécutés" })).toBeVisible();
  await expectBodyText(page, "sprint13-demo-import.csv");
  await expectNoMojibake(page);
  await capture(page, testInfo, "sprint13-csv-desktop-06-history");

  await page.getByRole("link", { name: /Consulter le d[eé]tail/ }).first().click();
  await expect(page.getByRole("heading", { name: /Import CSV|sprint13-demo-import\.csv/i })).toBeVisible();
  await expectBodyText(page, "Statut TVA: Assujetti");
  await expectBodyText(page, "Statut TVA: À vérifier");
  await expect(page.locator("body")).toContainText(/Annulation s[eé]curis[eé]e/);
  await expectNoMojibake(page);
  const detailUrl = page.url();
  await capture(page, testInfo, "sprint13-csv-desktop-07-detail");

  await page.goto("/organizations?query=Atlas%20D%C3%A9mo%20Nouvelle%20Agence");
  await expect(page.getByRole("link", { name: /Atlas Démo Nouvelle Agence/ })).toBeVisible();
  await page.getByRole("link", { name: /Atlas Démo Nouvelle Agence/ }).first().click();
  await expectBodyText(page, "Statut TVA");
  await expectBodyText(page, "Assujetti");
  await expectNoMojibake(page);
  await capture(page, testInfo, "sprint13-csv-desktop-08-organization-vat-status");

  await page.goto("/pipeline?query=%C3%89lodie%20Carpentier");
  await expectBodyText(page, "Élodie Carpentier");
  await expectBodyText(page, "Atlas Démo Nouvelle Agence");
  await expectNoMojibake(page);
  await capture(page, testInfo, "sprint13-csv-desktop-09-pipeline-after-import");

  await page.goto("/pipeline?query=Hugo%20Lambert");
  await expectBodyText(page, "Aucune relation dans le pipeline");

  await page.goto(detailUrl);
  await page.getByRole("button", { name: "Demander l'annulation" }).click();
  await expect(page.getByRole("dialog", { name: "Confirmer l'annulation de l'import" })).toBeVisible();
  await page.getByLabel(/Je confirme vouloir lancer/).check();
  await page.getByRole("button", { name: "Valider l'annulation" }).click();
  await expect(page.locator("body")).toContainText(/donn[eé]e\(s\) supprim[eé]e\(s\)/, { timeout: 30000 });
  await expect(page.locator("body")).toContainText(/conserv[eé]e\(s\)/);
  await expectNoMojibake(page);
  await capture(page, testInfo, "sprint13-csv-desktop-10-after-cancellation");

  await page.goto(`/organizations/${process.env.QA_ORGANIZATION_A_ID}`);
  await expectBodyText(page, "Atlas QA Organization A");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/imports");
  await expect(page.getByRole("heading", { name: "Importer des contacts" })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: "sprint13-demo-import-mobile.csv",
    mimeType: "text/csv",
    buffer: csvBuffer
  });
  await expectBodyText(page, "Statut TVA");
  await expectNoBlockingHorizontalOverflow(page);
  await expectNoMojibake(page);
  await capture(page, testInfo, "sprint13-csv-mobile-01-preview-mapping");

  await page.getByRole("button", { name: "Valider et vérifier" }).click();
  await expectBodyText(page, "Statut TVA non reconnu");
  await resolveRequiredDecisions(page);
  await expectNoBlockingHorizontalOverflow(page);
  await capture(page, testInfo, "sprint13-csv-mobile-02-review-warnings");

  await page.getByLabel(/Ajouter les contacts .* pipeline/i).check();
  await page.getByRole("button", { name: /Pr[eé]parer la suite/ }).click();
  await expectBodyText(page, "Import prêt à exécuter");
  await expectNoBlockingHorizontalOverflow(page);
  await capture(page, testInfo, "sprint13-csv-mobile-03-summary");

  await page.getByRole("button", { name: "Confirmer et lancer l'import" }).click();
  await expect(page.locator("body")).toContainText(/Import termin/i, { timeout: 30000 });
  await expectNoBlockingHorizontalOverflow(page);
  await capture(page, testInfo, "sprint13-csv-mobile-04-result");

  await page.goto("/imports");
  await expectBodyText(page, "sprint13-demo-import-mobile.csv");
  await expectNoBlockingHorizontalOverflow(page);
  await capture(page, testInfo, "sprint13-csv-mobile-05-history");

  await page.getByRole("link", { name: /Consulter le d[eé]tail/ }).first().click();
  await expectBodyText(page, "Statut TVA: Assujetti");
  await expectNoBlockingHorizontalOverflow(page);
  const mobileDetailUrl = page.url();
  await capture(page, testInfo, "sprint13-csv-mobile-06-detail-vat");

  await page.goto("/pipeline?query=%C3%89lodie%20Carpentier");
  await expectBodyText(page, "Élodie Carpentier");
  await expectNoBlockingHorizontalOverflow(page);
  await capture(page, testInfo, "sprint13-csv-mobile-07-pipeline");

  await page.goto(mobileDetailUrl);
  await page.getByRole("button", { name: "Demander l'annulation" }).click();
  await page.getByLabel(/Je confirme vouloir lancer/).check();
  await page.getByRole("button", { name: "Valider l'annulation" }).click();
  await expect(page.locator("body")).toContainText(/donn[eé]e\(s\) supprim[eé]e\(s\)/, { timeout: 30000 });
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

async function expectBodyText(page: Page, text: string) {
  await expect(page.locator("body")).toContainText(text);
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
