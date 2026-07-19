import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

const requiredEnv = [
  "RELATIONSHIPS_TEST_TENANT_A_EMAIL",
  "RELATIONSHIPS_TEST_TENANT_A_PASSWORD",
  "QA_RELATIONSHIP_A_ID",
  "QA_RELATIONSHIP_B_ID"
] as const;

const hasE2eEnv = requiredEnv.every((key) => Boolean(process.env[key]));

test.describe("Recruitment pipeline UI authenticated flow", () => {
  test.skip(!hasE2eEnv, "Set local Supabase Pipeline E2E credentials to run authenticated Pipeline E2E.");

  test("kanban, list, stage transitions, signature, refusal, reopen, owner and contact actions", async ({ page }, testInfo) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(process.env.RELATIONSHIPS_TEST_TENANT_A_EMAIL!);
    await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.RELATIONSHIPS_TEST_TENANT_A_PASSWORD!);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/pipeline?query=${encodeURIComponent("Atlas QA Person A")}`);
    await expect(page.getByRole("heading", { name: "Pipeline de recrutement" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Détection" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Refus" })).toBeVisible();
    await expect(page.getByText("Atlas QA Person A")).toBeVisible();
    await capture(page, testInfo, "pipeline-desktop-kanban");

    const listButton = page.getByRole("button", { name: "Liste" });
    await listButton.focus();
    await expect(listButton).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/view=list/);
    await expect(page.getByText("Atlas QA Organization A")).toBeVisible();
    await capture(page, testInfo, "pipeline-desktop-list");

    await page.getByRole("button", { name: "Kanban" }).click();
    await expect(page).toHaveURL(/view=kanban/);
    await page.setViewportSize({ width: 768, height: 1024 });
    await capture(page, testInfo, "pipeline-tablet-kanban");
    await page.setViewportSize({ width: 390, height: 844 });
    await capture(page, testInfo, "pipeline-mobile-kanban");
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto(`/pipeline?query=${encodeURIComponent("No matching pipeline card")}`);
    await expect(page.getByRole("heading", { name: "Pipeline vide" })).toBeVisible();
    await capture(page, testInfo, "pipeline-empty-state");
    await page.goto(`/pipeline?query=${encodeURIComponent("Atlas QA Person A")}`);

    await dragStage(page, "Conversation engagée");
    const dragDialog = page.getByRole("dialog", { name: "Changer la phase" });
    await expect(dragDialog.getByLabel("Phase cible")).toBeFocused();
    await dragDialog.getByLabel("Motif ou note").fill("Conversation validée depuis drag and drop E2E");
    await dragDialog.getByRole("button", { name: "Valider" }).click();
    await expect(dragDialog).toBeHidden({ timeout: 15000 });
    await expect(page.getByText("Phase mise à jour.")).toBeVisible();
    await expect(pipelineCard(page).getByText("Conversation engagée")).toBeVisible();

    await page.route("**/api/relationships/*/pipeline", async (route) => {
      await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "Relationship pipeline stage is stale." }) });
    }, { times: 1 });
    await dragStage(page, "Rendez-vous obtenu");
    const rejectedDragDialog = page.getByRole("dialog", { name: "Changer la phase" });
    await rejectedDragDialog.getByLabel("Motif ou note").fill("Transition obsolète depuis E2E");
    await rejectedDragDialog.getByRole("button", { name: "Valider" }).click();
    await expect(page.getByRole("alert")).toContainText("stale");
    await expect(pipelineCard(page).getByText("Conversation engagée")).toBeVisible();
    await rejectedDragDialog.getByRole("button", { name: "Annuler" }).click();
    await expect(rejectedDragDialog).toBeHidden();

    await pipelineCard(page).getByRole("button", { name: "Responsable" }).click();
    const ownerDialog = page.getByRole("dialog", { name: "Modifier le responsable" });
    await expect(ownerDialog.getByLabel("Responsable")).toBeFocused();
    await ownerDialog.getByLabel("Responsable").selectOption("");
    await ownerDialog.getByRole("button", { name: "Valider" }).click();
    await expect(ownerDialog).toBeHidden({ timeout: 15000 });
    await expect(page.getByText("Responsable mis à jour.")).toBeVisible();
    await expect(pipelineCard(page).getByText("Sans responsable")).toBeVisible();

    await pipelineCard(page).getByRole("button", { name: "Changer de phase" }).click();
    const invalidSignatureDialog = page.getByRole("dialog", { name: "Changer la phase" });
    await invalidSignatureDialog.getByLabel("Phase cible").selectOption({ label: "Signature" });
    await invalidSignatureDialog.getByRole("button", { name: "Valider" }).click();
    await expect(invalidSignatureDialog).toBeVisible();
    await invalidSignatureDialog.getByRole("button", { name: "Annuler" }).click();
    await expect(invalidSignatureDialog).toBeHidden();
    await expect(pipelineCard(page).getByText("Conversation engagée")).toBeVisible();

    await changeStage(page, "Signature", "Signature confirmée depuis E2E", async (stageDialog) => {
      await stageDialog.getByLabel("Confirmation explicite").check();
      await stageDialog.getByLabel("Date de signature").fill("2099-07-20T10:00");
    });
    await expect(page.getByText("Phase mise à jour.")).toBeVisible();
    await expect(pipelineCard(page).getByText("Signature")).toBeVisible();
    await expect(pipelineCard(page).getByText("Signature programmée")).toBeVisible();

    await pipelineCard(page).getByRole("button", { name: "Changer de phase" }).click();
    const missingSignatureLeaveReason = page.getByRole("dialog", { name: "Changer la phase" });
    await missingSignatureLeaveReason.getByLabel("Phase cible").selectOption({ label: "Négociation" });
    await missingSignatureLeaveReason.getByLabel("Confirmation explicite").check();
    await missingSignatureLeaveReason.getByRole("button", { name: "Valider" }).click();
    await expect(missingSignatureLeaveReason).toBeVisible();
    await missingSignatureLeaveReason.getByRole("button", { name: "Annuler" }).click();

    await pipelineCard(page).getByRole("button", { name: "Changer de phase" }).click();
    const invalidRefusalDialog = page.getByRole("dialog", { name: "Changer la phase" });
    await invalidRefusalDialog.getByLabel("Phase cible").selectOption({ label: "Refus" });
    await invalidRefusalDialog.getByLabel("Motif ou note").fill("Refus sans motif officiel");
    await invalidRefusalDialog.getByLabel("Confirmation explicite").check();
    await invalidRefusalDialog.getByRole("button", { name: "Valider" }).click();
    await expect(invalidRefusalDialog).toBeVisible();
    await invalidRefusalDialog.getByRole("button", { name: "Annuler" }).click();

    await changeStage(page, "Refus", "Refus documenté depuis E2E", async (stageDialog) => {
      await stageDialog.getByLabel("Confirmation explicite").check();
      await stageDialog.getByLabel("Motif de refus").selectOption("not_interested");
      await stageDialog.getByLabel("Ne plus contacter").check();
    });
    await expect(page.getByText("Phase mise à jour.")).toBeVisible();
    await expect(pipelineCard(page).getByText("Ne plus contacter")).toBeVisible();

    await pipelineCard(page).getByRole("button", { name: "Changer de phase" }).click();
    const reopenDialog = page.getByRole("dialog", { name: "Changer la phase" });
    await expect(reopenDialog.getByLabel("Phase cible").locator("option[value='rejected']")).toHaveCount(0);
    await reopenDialog.getByRole("button", { name: "Valider" }).click();
    await expect(reopenDialog).toBeVisible();
    await reopenDialog.getByLabel("Motif ou note").fill("Réouverture documentée depuis E2E");
    await reopenDialog.getByRole("button", { name: "Valider" }).click();
    await expect(reopenDialog).toBeHidden({ timeout: 15000 });
    await expect(page.getByText("Phase mise à jour.")).toBeVisible();
    await expect(pipelineCard(page).getByText("Qualification")).toBeVisible();
    await expect(pipelineCard(page).getByText("Ne plus contacter")).toBeVisible();

    await pipelineCard(page).getByRole("button", { name: "Lever le blocage" }).click();
    const contactDialog = page.getByRole("dialog", { name: "Lever Ne plus contacter" });
    await contactDialog.getByLabel("Justification").fill("Consentement revalidé depuis E2E");
    await contactDialog.getByRole("button", { name: "Valider" }).click();
    await expect(contactDialog).toBeHidden({ timeout: 15000 });
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
  await pipelineCard(page).getByRole("button", { name: "Changer de phase" }).click();
  const stageDialog = page.getByRole("dialog", { name: "Changer la phase" });
  await stageDialog.getByLabel("Phase cible").selectOption({ label });
  await stageDialog.getByLabel("Motif ou note").fill(reason);
  if (fillExtra) await fillExtra(stageDialog);
  await stageDialog.getByRole("button", { name: "Valider" }).click();
  await expect(stageDialog).toBeHidden({ timeout: 15000 });
}

async function dragStage(page: Page, label: string) {
  const target = page.locator(".pipeline-column").filter({ has: page.getByRole("heading", { name: label }) });
  await pipelineCard(page).dragTo(target);
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath("pipeline-visual-qa", `${name}.png`);
  mkdirSync(dirname(path), { recursive: true });
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: "image/png" });
}
