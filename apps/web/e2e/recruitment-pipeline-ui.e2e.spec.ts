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
    await expect(pipelineCard(page).locator(".pipeline-meta-label").filter({ hasText: /^Responsable$/ })).toHaveCount(1);
    await expect(pipelineCard(page).locator(".pipeline-meta-label").filter({ hasText: /^Prochaine action$/ })).toHaveCount(1);
    await expect(pipelineCard(page)).not.toContainText("Utilisateur courantAction");
    await expectPipelineResponsiveLayout(page, { expectKanbanScroll: true });
    await capture(page, testInfo, "pipeline-desktop-kanban");

    const listButton = page.getByRole("button", { name: "Liste" });
    await listButton.focus();
    await expect(listButton).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/view=list/);
    await expect(page.locator(".pipeline-table").getByText("Atlas QA Organization A")).toBeVisible();
    await expectPipelineResponsiveLayout(page, { expectListScroll: true });
    await capture(page, testInfo, "pipeline-desktop-list");

    await page.getByRole("button", { name: "Kanban" }).click();
    await expect(page).toHaveURL(/view=kanban/);
    await page.setViewportSize({ width: 768, height: 1024 });
    await expectPipelineResponsiveLayout(page, { expectKanbanScroll: true });
    await capture(page, testInfo, "pipeline-tablet-kanban");
    await page.setViewportSize({ width: 390, height: 844 });
    await expectMobileMenu(page, false);
    await capture(page, testInfo, "pipeline-mobile-menu-closed");
    await page.getByRole("button", { name: "Menu" }).click();
    await expectMobileMenu(page, true);
    await capture(page, testInfo, "pipeline-mobile-menu-open");
    await page.getByRole("button", { name: "Fermer", exact: true }).click();
    await expectMobileMenu(page, false);
    await expectPipelineAdvancedFilters(page, false);
    await capture(page, testInfo, "pipeline-mobile-filters-closed");
    await page.getByRole("button", { name: "Filtres" }).click();
    await expectPipelineAdvancedFilters(page, true);
    await capture(page, testInfo, "pipeline-mobile-filters-open");
    await page.getByRole("button", { name: "Filtres" }).click();
    await expectPipelineAdvancedFilters(page, false);
    await expectPipelineResponsiveLayout(page, { expectKanbanScroll: true });
    await capture(page, testInfo, "pipeline-mobile-kanban");
    await page.getByRole("button", { name: "Liste" }).click();
    await expect(page).toHaveURL(/view=list/);
    await expect(page.locator(".pipeline-list-cards").getByText("Atlas QA Organization A")).toBeVisible();
    await expectPipelineResponsiveLayout(page, { expectMobileListCards: true });
    await capture(page, testInfo, "pipeline-mobile-list-cards");
    await page.getByRole("button", { name: "Kanban" }).click();
    await expect(page).toHaveURL(/view=kanban/);
    await pipelineCard(page).getByRole("button", { name: "Changer de phase" }).click();
    const mobileDialog = page.getByRole("dialog", { name: "Changer la phase" });
    await expect(mobileDialog.getByRole("button", { name: "Valider" })).toBeVisible();
    await expect(mobileDialog.getByRole("button", { name: "Annuler" })).toBeVisible();
    await mobileDialog.getByRole("button", { name: "Annuler" }).click();
    await expect(mobileDialog).toBeHidden();
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
    await expect(page.locator("p[role='alert']")).toContainText("stale");
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
    await expect(pipelineCard(page).getByText("Signature", { exact: true })).toBeVisible();
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
  await page.evaluate((targetLabel) => {
    const card = Array.from(document.querySelectorAll<HTMLElement>(".pipeline-card"))
      .find((element) => element.textContent?.includes("Atlas QA Person A"));
    const target = Array.from(document.querySelectorAll<HTMLElement>(".pipeline-column"))
      .find((element) => element.textContent?.includes(targetLabel));
    if (!card || !target) throw new Error(`Cannot drag pipeline card to ${targetLabel}`);

    const dataTransfer = new DataTransfer();
    card.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer }));
    target.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer }));
    target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }));
  }, label);
  await expect(page.getByRole("dialog", { name: "Changer la phase" })).toBeVisible();
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath("pipeline-visual-qa", `${name}.png`);
  mkdirSync(dirname(path), { recursive: true });
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

async function expectPipelineResponsiveLayout(page: Page, options: { expectKanbanScroll?: boolean; expectListScroll?: boolean; expectMobileListCards?: boolean }) {
  await expect(page.getByRole("button", { name: "Filtrer" })).toBeVisible();
  await expect(page.locator(".pipeline-filters a[href='/pipeline']")).toBeVisible();

  const layout = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const filterButton = Array.from(document.querySelectorAll<HTMLElement>("button"))
      .find((button) => button.textContent?.trim() === "Filtrer");
    const resetLink = document.querySelector<HTMLElement>(".pipeline-filters a[href='/pipeline']");
    const pipelineBoard = document.querySelector<HTMLElement>(".pipeline-board");
    const pipelineTable = document.querySelector<HTMLElement>(".pipeline-table");
    const mobileListCards = document.querySelector<HTMLElement>(".pipeline-list-cards");

    function isInsideViewport(element: HTMLElement | null | undefined) {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= viewportWidth && rect.width > 0 && rect.height > 0;
    }

    return {
      pageOverflowX: document.documentElement.scrollWidth - viewportWidth,
      filterButtonVisible: isInsideViewport(filterButton),
      resetLinkVisible: isInsideViewport(resetLink),
      kanbanHasOwnScroll: pipelineBoard ? pipelineBoard.scrollWidth > pipelineBoard.clientWidth : false,
      tableHasOwnScroll: pipelineTable ? pipelineTable.scrollWidth > pipelineTable.clientWidth : false,
      mobileCardsVisible: mobileListCards ? getComputedStyle(mobileListCards).display !== "none" : false
    };
  });

  expect(layout.pageOverflowX).toBeLessThanOrEqual(2);
  expect(layout.filterButtonVisible).toBe(true);
  expect(layout.resetLinkVisible).toBe(true);
  if (options.expectKanbanScroll) expect(layout.kanbanHasOwnScroll).toBe(true);
  if (options.expectListScroll) expect(layout.tableHasOwnScroll).toBe(true);
  if (options.expectMobileListCards) expect(layout.mobileCardsVisible).toBe(true);
}

async function expectMobileMenu(page: Page, open: boolean) {
  await expect(page.getByRole("button", { name: "Menu", exact: true })).toBeVisible();
  await expect.poll(async () => page.evaluate(() => {
    const sidebar = document.querySelector<HTMLElement>(".sidebar");
    const backdrop = document.querySelector<HTMLElement>(".shell-backdrop");
    if (!sidebar) return { sidebarVisible: false, backdropVisible: false };
    const rect = sidebar.getBoundingClientRect();
    return {
      sidebarVisible: sidebar.classList.contains("sidebar-open") && rect.right > 0 && rect.left < window.innerWidth,
      backdropVisible: Boolean(backdrop && getComputedStyle(backdrop).display !== "none")
    };
  })).toEqual({ sidebarVisible: open, backdropVisible: open });
}

async function expectPipelineAdvancedFilters(page: Page, open: boolean) {
  await expect(page.getByRole("button", { name: "Filtres" })).toHaveAttribute("aria-expanded", open ? "true" : "false");
  const visible = await page.locator("#pipeline-advanced-filters").evaluate((element) => getComputedStyle(element).display !== "none");
  expect(visible).toBe(open);
}
