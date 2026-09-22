import { expect, test } from "@playwright/test";

const requiredEnv = [
  "RELATIONSHIPS_TEST_TENANT_A_EMAIL",
  "RELATIONSHIPS_TEST_TENANT_A_PASSWORD"
] as const;

const hasE2eEnv = requiredEnv.every((key) => Boolean(process.env[key]));

test.describe("Relationships authenticated flow", () => {
  test.skip(!hasE2eEnv, "Set RELATIONSHIPS_TEST_TENANT_A_EMAIL and RELATIONSHIPS_TEST_TENANT_A_PASSWORD locally to run authenticated Relationships E2E.");

  test("login, create, search, edit, duplicate warning, delete, logout", async ({ page }) => {
    const marker = `Relationship E2E ${Date.now()}`;
    const personName = `${marker} Person`;
    const organizationName = `${marker} Organization`;

    await page.goto("/login");
    await page.getByLabel("Email").fill(process.env.RELATIONSHIPS_TEST_TENANT_A_EMAIL!);
    await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.RELATIONSHIPS_TEST_TENANT_A_PASSWORD!);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto("/people/new");
    const recruitmentCheckbox = page.getByLabel("Candidat recrutement — ajouter automatiquement au Pipeline");
    if (await recruitmentCheckbox.isChecked()) await recruitmentCheckbox.uncheck();
    await page.getByLabel("Nom d'affichage").fill(personName);
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page).toHaveURL((url) => url.pathname.startsWith("/people/") && url.pathname !== "/people/new");
    const personPath = new URL(page.url()).pathname;

    await page.goto("/organizations/new");
    await page.getByLabel("Nom", { exact: true }).fill(organizationName);
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page).toHaveURL(/\/organizations\/[^/]+$/);

    await page.goto("/relationships/new");
    await page.getByLabel("Personne").selectOption({ label: personName });
    await page.getByLabel("Organisation").selectOption({ label: organizationName });
    await page.getByLabel("Notes").fill(marker);
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page).toHaveURL(/\/relationships\/[^/]+$/);

    await page.goto(`/relationships?query=${encodeURIComponent(marker)}`);
    await expect(page.getByText(personName)).toBeVisible();
    await expect(page.getByText(organizationName)).toBeVisible();

    await page.getByText(personName).click();
    await page.getByText("Modifier la relation").click();
    await page.getByLabel("Score").fill("82");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("82")).toBeVisible();
    const relationshipPath = new URL(page.url()).pathname;

    const relationshipId = relationshipPath.split("/").pop()!;
    for (const suffix of ["1", "2", "3"]) {
      await page.getByText("Tâches liées").click();
      await page.getByRole("link", { name: "Nouvelle tâche" }).click();
      await expect(page).toHaveURL(/\/tasks\/new\?.*returnTo=%2Frelationships%2F/);
      await page.getByLabel("Titre").fill(`${marker} Task ${suffix}`);
      await page.getByRole("button", { name: "Enregistrer" }).click();
      await expect(page).toHaveURL(/\/tasks\/[^/?]+\?returnTo=%2Frelationships%2F/);
      await page.getByRole("link", { name: "Retour" }).click();
      await expect(page).toHaveURL(new RegExp(relationshipPath + "$"));
    }

    await page.getByText("Tâches liées").click();
    await page.getByRole("link", { name: "Voir toutes les tâches" }).click();
    await expect(page).toHaveURL((url) => url.pathname === "/tasks" && url.searchParams.get("relationshipId") === relationshipId);
    await expect(page.getByRole("heading", { name: `${marker} Task 3` })).toBeVisible();
    await page.getByLabel("Statut").selectOption("todo");
    await page.getByRole("button", { name: "Filtrer" }).click();
    await expect(page).toHaveURL((url) => url.pathname === "/tasks" && url.searchParams.get("relationshipId") === relationshipId && url.searchParams.get("status") === "todo");
    const relationshipTasksUrl = page.url();
    await page.getByRole("heading", { name: `${marker} Task 3` }).click();
    await expect(page).toHaveURL(/\/tasks\/[^/?]+\?returnTo=%2Ftasks%3F/);
    await page.getByRole("link", { name: "Retour" }).click();
    await expect(page).toHaveURL(relationshipTasksUrl);
    await page.getByRole("link", { name: "Retour à la relation" }).click();
    await expect(page).toHaveURL(new RegExp(relationshipPath + "$"));

    const interactionTitle = `${marker} Interaction`;
    await page.getByText("Chronologie").click();
    await page.getByRole("link", { name: "Nouvel échange" }).click();
    await expect(page).toHaveURL((url) => url.pathname === "/interactions/new" && url.searchParams.get("relationshipId") === relationshipId);
    await page.getByLabel("Titre").fill(interactionTitle);
    await page.getByLabel("Résumé").fill("Created from Relationship E2E");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page).toHaveURL(/\/interactions\/[^/?]+\?returnTo=%2Frelationships%2F/);
    await page.getByRole("link", { name: "Retour" }).click();
    await expect(page).toHaveURL(new RegExp(relationshipPath + "$"));
    await page.getByText("Chronologie").click();
    await expect(page.getByText(interactionTitle)).toBeVisible();

    const projectTitle = `${marker} Project`;
    await page.getByText("Projets liés").click();
    await page.getByRole("link", { name: "Nouveau Projet" }).click();
    await expect(page).toHaveURL((url) => url.pathname === "/projects/new" && url.searchParams.get("relationshipId") === relationshipId);
    await page.getByLabel("Titre").fill(projectTitle);
    await page.getByRole("button", { name: "Créer le Projet" }).click();
    await expect(page).toHaveURL(/\/projects\/[^/?]+\?projectSaved=1&returnTo=%2Frelationships%2F/);
    await page.getByRole("link", { name: "Retour" }).click();
    await expect(page).toHaveURL(new RegExp(relationshipPath + "$"));
    await page.getByText("Projets liés").click();
    await expect(page.getByText(projectTitle)).toBeVisible();

    await page.getByRole("link", { name: organizationName, exact: true }).click();
    await expect(page).toHaveURL((url) => url.pathname.startsWith("/organizations/") && url.searchParams.get("returnTo") === relationshipPath);
    const organizationReturnPath = `${new URL(page.url()).pathname}${new URL(page.url()).search}`;
    const organizationTaskTitle = `${marker} Organization Task`;
    await page.getByRole("link", { name: "Nouvelle tâche" }).click();
    await expect(page).toHaveURL((url) => url.pathname === "/tasks/new" && url.searchParams.get("returnTo") === organizationReturnPath);
    await page.getByLabel("Titre").fill(organizationTaskTitle);
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page).toHaveURL((url) => url.pathname.startsWith("/tasks/") && url.searchParams.get("returnTo") === organizationReturnPath);
    await page.getByRole("link", { name: "Retour" }).click();
    await expect(page).toHaveURL((url) => `${url.pathname}${url.search}` === organizationReturnPath);
    await expect(page.getByRole("heading", { name: organizationTaskTitle })).toBeVisible();

    const organizationProjectTitle = `${marker} Organization Project`;
    await page.getByRole("link", { name: "Nouveau Projet" }).click();
    await expect(page).toHaveURL((url) => url.pathname === "/projects/new" && url.searchParams.get("returnTo") === organizationReturnPath);
    await page.getByLabel("Titre").fill(organizationProjectTitle);
    await page.getByRole("button", { name: "Créer le Projet" }).click();
    await expect(page).toHaveURL((url) => url.pathname.startsWith("/projects/") && url.searchParams.get("returnTo") === organizationReturnPath);
    await page.getByRole("link", { name: "Retour" }).click();
    await expect(page).toHaveURL((url) => `${url.pathname}${url.search}` === organizationReturnPath);
    await expect(page.getByText(organizationProjectTitle)).toBeVisible();

    await page.getByRole("link", { name: personName, exact: true }).click();
    await expect(page).toHaveURL((url) => url.pathname.startsWith("/people/") && url.searchParams.get("returnTo") === organizationReturnPath);
    await page.getByRole("link", { name: "Retour" }).click();
    await expect(page).toHaveURL((url) => `${url.pathname}${url.search}` === organizationReturnPath);
    await page.getByRole("link", { name: "Retour" }).click();
    await expect(page).toHaveURL(new RegExp(relationshipPath + "$"));

    await page.goto(personPath);
    const personProjectTitle = `${marker} Person Project`;
    await page.getByText("Projets liés").click();
    await page.getByRole("link", { name: "Nouveau Projet" }).click();
    await expect(page).toHaveURL((url) => url.pathname === "/projects/new" && url.searchParams.get("returnTo") === personPath);
    await page.getByLabel("Titre").fill(personProjectTitle);
    await page.getByRole("button", { name: "Créer le Projet" }).click();
    await expect(page).toHaveURL((url) => url.pathname.startsWith("/projects/") && url.searchParams.get("returnTo") === personPath);
    await page.getByRole("link", { name: "Retour" }).click();
    await expect(page).toHaveURL(new RegExp(`${personPath}$`));
    await page.getByText("Projets liés").click();
    await expect(page.getByText(personProjectTitle)).toBeVisible();

    await page.getByText("Relations de recrutement liées").click();
    await page.getByRole("link", { name: "recruiting - detection - active" }).click();
    await expect(page).toHaveURL(/\/relationships\/[^/?]+\?returnTo=%2Fpeople%2F/);
    await page.getByRole("link", { name: "Retour" }).click();
    await expect(page).toHaveURL(new RegExp(`${personPath}$`));

    await page.goto("/relationships/new");
    await page.getByLabel("Personne").selectOption({ label: personName });
    await page.getByLabel("Organisation").selectOption({ label: organizationName });
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Relation active identique détectée")).toBeVisible();

    await page.goto(`/relationships?query=${encodeURIComponent(marker)}`);
    await page.getByText(personName).click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Supprimer" }).click();
    await expect(page).toHaveURL(/\/relationships/);

    await page.context().clearCookies();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});
