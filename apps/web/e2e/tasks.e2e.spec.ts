import { expect, test } from "@playwright/test";

const requiredEnv = [
  "TASKS_TEST_TENANT_A_EMAIL",
  "TASKS_TEST_TENANT_A_PASSWORD"
] as const;

const hasE2eEnv = requiredEnv.every((key) => Boolean(process.env[key]));

test.describe("Tasks authenticated flow", () => {
  test.skip(!hasE2eEnv, "Set TASKS_TEST_TENANT_A_EMAIL and TASKS_TEST_TENANT_A_PASSWORD locally to run authenticated Tasks E2E.");

  test("login, create from contexts, search, edit, complete, reopen, delete, logout", async ({ page }) => {
    test.setTimeout(180_000);
    const marker = `Task E2E ${Date.now()}`;
    const personName = `${marker} Person`;
    const organizationName = `${marker} Organization`;

    await page.goto("/login");
    await page.getByLabel("Email").fill(process.env.TASKS_TEST_TENANT_A_EMAIL!);
    await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.TASKS_TEST_TENANT_A_PASSWORD!);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto("/people/new");
    await page.getByLabel("Nom d'affichage").fill(personName);
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page).toHaveURL(/\/people\/[0-9a-f-]{36}(?:\?.*)?$/i);
    const personUrl = page.url();

    await page.goto("/organizations/new");
    await page.getByLabel("Nom").fill(organizationName);
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page).toHaveURL(/\/organizations\/[0-9a-f-]{36}(?:\?.*)?$/i);

    await page.goto(personUrl);
    await page.locator("summary").filter({ hasText: "Tâches liées" }).click();
    await page.getByRole("link", { name: "Nouvelle tâche" }).click();
    await page.getByLabel("Titre").fill(marker);
    await page.getByLabel("Description").fill("Created from Tasks E2E");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page).toHaveURL(/\/tasks\/[0-9a-f-]{36}(?:\?.*)?$/i);
    await expect(page).toHaveURL(/returnTo=%2Fpeople%2F/);
    await page.getByRole("link", { name: "Retour" }).click();
    await expect(page).toHaveURL(personUrl);

    await page.locator("summary").filter({ hasText: "Tâches liées" }).click();
    await expect(page.locator("a.task-card").filter({ has: page.getByRole("heading", { name: marker, exact: true }) })).toBeVisible();
    await page.locator("a.task-card").filter({ has: page.getByRole("heading", { name: marker, exact: true }) }).click();
    await expect(page).toHaveURL(/\/tasks\/[^/?]+\?returnTo=%2Fpeople%2F/);
    await page.getByRole("link", { name: "Retour" }).click();
    await expect(page).toHaveURL(personUrl);

    await page.goto(`/tasks?query=${encodeURIComponent(marker)}`);
    await expect(page.locator("a.task-card").filter({ has: page.getByRole("heading", { name: marker, exact: true }) })).toBeVisible();

    await page.locator("a.task-card").filter({ has: page.getByRole("heading", { name: marker, exact: true }) }).click();
    await page.getByLabel("Raison").fill("Updated from Tasks E2E");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.locator("p").filter({ hasText: "Updated from Tasks E2E" })).toBeVisible();

    await page.getByRole("button", { name: "Terminer" }).click();
    await expect(page.locator("section").filter({ has: page.getByRole("heading", { name: "Statut", exact: true }) })).toContainText("Terminée");
    await page.getByRole("button", { name: "Rouvrir" }).click();
    await expect(page.locator("section").filter({ has: page.getByRole("heading", { name: "Statut", exact: true }) })).toContainText("À faire");

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Supprimer" }).click();
    await expect(page).toHaveURL((url) => url.pathname === "/tasks");

    await page.context().clearCookies();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});
