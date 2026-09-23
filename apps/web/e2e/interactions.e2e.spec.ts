import { expect, test } from "@playwright/test";

const requiredEnv = [
  "INTERACTIONS_TEST_TENANT_A_EMAIL",
  "INTERACTIONS_TEST_TENANT_A_PASSWORD"
] as const;

const hasE2eEnv = requiredEnv.every((key) => Boolean(process.env[key]));

test.describe("Interactions authenticated flow", () => {
  test.skip(!hasE2eEnv, "Set INTERACTIONS_TEST_TENANT_A_EMAIL and INTERACTIONS_TEST_TENANT_A_PASSWORD locally to run authenticated Interactions E2E.");

  test("login, create, search, edit, timeline, delete, logout", async ({ page }) => {
    test.setTimeout(180_000);
    const marker = `Interaction E2E ${Date.now()}`;
    const personName = `${marker} Person`;

    await page.goto("/login");
    await page.getByLabel("Email").fill(process.env.INTERACTIONS_TEST_TENANT_A_EMAIL!);
    await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.INTERACTIONS_TEST_TENANT_A_PASSWORD!);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto("/people/new");
    // This scenario needs a person, not an automatic recruiting relationship.
    await page.getByLabel("Candidat recrutement — ajouter automatiquement au Pipeline").uncheck();
    await page.getByLabel("Nom d'affichage").fill(personName);
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page).toHaveURL(/\/people\/[0-9a-f-]{36}(?:\?.*)?$/i);
    const personUrl = page.url();

    await page.goto(personUrl);
    await page.locator("summary").filter({ hasText: "Chronologie" }).click();
    await page.getByRole("link", { name: "Nouvel échange" }).click();
    await page.locator('select[name="person_id"]').selectOption({ label: personName });
    await page.getByLabel("Titre").fill(marker);
    await page.getByLabel("Résumé").fill("Created from Interactions E2E");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page).toHaveURL(/\/interactions\/[0-9a-f-]{36}(?:\?.*)?$/i);
    await expect(page).toHaveURL(/returnTo=%2Fpeople%2F/);
    await page.getByRole("link", { name: "Retour" }).click();
    await expect(page).toHaveURL(personUrl);
    await page.locator("summary").filter({ hasText: "Chronologie" }).click();
    await expect(page.getByText(marker, { exact: true })).toBeVisible();

    await page.goto(`/interactions?query=${encodeURIComponent(marker)}`);
    await expect(page.getByText(marker, { exact: true })).toBeVisible();

    await page.getByText(marker, { exact: true }).click();
    await page.getByLabel("Commentaires").fill("Updated from Interactions E2E");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.locator("p").filter({ hasText: "Updated from Interactions E2E" })).toBeVisible();

    await page.goto(`/people?query=${encodeURIComponent(personName)}`);
    await page.getByText(personName, { exact: true }).click();
    await page.locator("summary").filter({ hasText: "Chronologie" }).click();
    await expect(page.getByText(marker, { exact: true })).toBeVisible();

    await page.goto(`/interactions?query=${encodeURIComponent(marker)}`);
    await page.getByText(marker, { exact: true }).click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Supprimer" }).click();
    await expect(page).toHaveURL((url) => url.pathname === "/interactions");

    await page.context().clearCookies();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});
