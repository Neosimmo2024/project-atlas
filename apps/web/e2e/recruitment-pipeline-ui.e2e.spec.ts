import { expect, test, type Locator, type Page } from "@playwright/test";

const requiredEnv = [
  "RELATIONSHIPS_TEST_TENANT_A_EMAIL",
  "RELATIONSHIPS_TEST_TENANT_A_PASSWORD",
  "QA_RELATIONSHIP_A_ID",
  "QA_RELATIONSHIP_B_ID"
] as const;

const hasE2eEnv = requiredEnv.every((key) => Boolean(process.env[key]));

test.describe("Recruitment pipeline UI authenticated flow", () => {
  test.skip(!hasE2eEnv, "Set local Supabase Pipeline E2E credentials to run authenticated Pipeline E2E.");

  test("kanban, list, stage transitions, signature, refusal, reopen, owner and contact actions", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(process.env.RELATIONSHIPS_TEST_TENANT_A_EMAIL!);
    await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.RELATIONSHIPS_TEST_TENANT_A_PASSWORD!);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto(`/pipeline?query=${encodeURIComponent("Atlas QA Person A")}`);
    await expect(page.getByRole("heading", { name: "Pipeline de recrutement" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Détection" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Refus" })).toBeVisible();
    await expect(page.getByText("Atlas QA Person A")).toBeVisible();

    await page.getByRole("button", { name: "Liste" }).click();
    await expect(page).toHaveURL(/view=list/);
    await expect(page.getByText("Atlas QA Organization A")).toBeVisible();
    await page.getByRole("button", { name: "Kanban" }).click();
    await expect(page).toHaveURL(/view=kanban/);

    await changeStage(page, "Conversation engagée", "Conversation validée depuis E2E");
    await expect(page.getByText("Phase mise à jour.")).toBeVisible();
    await expect(pipelineCard(page).getByText("Conversation engagée")).toBeVisible();

    await page.getByRole("button", { name: "Responsable" }).first().click();
    const ownerDialog = page.getByRole("dialog", { name: "Modifier le responsable" });
    await ownerDialog.getByLabel("Responsable").selectOption("");
    await ownerDialog.getByRole("button", { name: "Valider" }).click();
    await expect(page.getByText("Responsable mis à jour.")).toBeVisible();
    await expect(pipelineCard(page).getByText("Sans responsable")).toBeVisible();

    await changeStage(page, "Signature", "Signature confirmée depuis E2E", async (stageDialog) => {
      await stageDialog.getByLabel("Confirmation explicite").check();
      await stageDialog.getByLabel("Date de signature").fill("2026-07-20T10:00");
    });
    await expect(page.getByText("Phase mise à jour.")).toBeVisible();
    await expect(pipelineCard(page).getByText("Signature")).toBeVisible();

    await changeStage(page, "Refus", "Refus documenté depuis E2E", async (stageDialog) => {
      await stageDialog.getByLabel("Motif de refus").selectOption("not_interested");
      await stageDialog.getByLabel("Ne plus contacter").check();
    });
    await expect(page.getByText("Phase mise à jour.")).toBeVisible();
    await expect(pipelineCard(page).getByText("Ne plus contacter")).toBeVisible();

    await changeStage(page, "Qualification", "Réouverture documentée depuis E2E");
    await expect(page.getByText("Phase mise à jour.")).toBeVisible();
    await expect(pipelineCard(page).getByText("Qualification")).toBeVisible();
    await expect(pipelineCard(page).getByText("Ne plus contacter")).toBeVisible();

    await page.getByRole("button", { name: "Lever le blocage" }).first().click();
    await page.getByLabel("Justification").fill("Consentement revalidé depuis E2E");
    await page.getByRole("button", { name: "Valider" }).click();
    await expect(page.getByText("Préférence de contact mise à jour.")).toBeVisible();

    const tenantBRead = await page.evaluate(async () => {
      const response = await fetch(`/api/pipeline?query=${encodeURIComponent("Atlas QA Person B")}`, { credentials: "same-origin" });
      return response.json() as Promise<{ data: unknown[] }>;
    });
    expect(tenantBRead.data).toHaveLength(0);

    await page.goto(`/relationships/${process.env.QA_RELATIONSHIP_B_ID!}`);
    await expect(page.getByText(/404|not found|introuvable/i)).toBeVisible();
  });
});

function pipelineCard(page: Page) {
  return page.locator(".pipeline-card").filter({ hasText: "Atlas QA Person A" }).first();
}

async function changeStage(page: Page, label: string, reason: string, fillExtra?: (stageDialog: Locator) => Promise<void>) {
  await page.getByRole("button", { name: "Changer de phase" }).first().click();
  const stageDialog = page.getByRole("dialog", { name: "Changer la phase" });
  await stageDialog.getByLabel("Phase cible").selectOption({ label });
  await stageDialog.getByLabel("Motif ou note").fill(reason);
  if (fillExtra) await fillExtra(stageDialog);
  await stageDialog.getByRole("button", { name: "Valider" }).click();
}
