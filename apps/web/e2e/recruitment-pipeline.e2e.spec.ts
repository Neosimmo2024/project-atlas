import { test, expect } from "@playwright/test";

const hasE2eEnv = Boolean(
  process.env.RELATIONSHIPS_TEST_TENANT_A_EMAIL
  && process.env.RELATIONSHIPS_TEST_TENANT_A_PASSWORD
  && process.env.QA_PERSON_A_ID
  && process.env.QA_ORGANIZATION_A_ID
);

test.describe("Recruitment pipeline foundation", () => {
  test.skip(!hasE2eEnv, "Set RELATIONSHIPS_TEST_TENANT_A_EMAIL, RELATIONSHIPS_TEST_TENANT_A_PASSWORD, QA_PERSON_A_ID, and QA_ORGANIZATION_A_ID to run authenticated recruitment pipeline E2E.");

  test("authenticates and transitions a relationship through the server API", async ({ page }) => {
    await page.goto(process.env.RELATIONSHIPS_E2E_BASE_URL ?? "http://127.0.0.1:3000");
    await page.getByLabel("Email").fill(process.env.RELATIONSHIPS_TEST_TENANT_A_EMAIL ?? "");
    await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.RELATIONSHIPS_TEST_TENANT_A_PASSWORD ?? "");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    const created = await page.evaluate(async (payload) => {
      const response = await fetch("/api/relationships", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const body = await response.json() as { data?: { id?: string; pipeline_stage?: string } };

      return { status: response.status, body };
    }, {
      person_id: process.env.QA_PERSON_A_ID,
      organization_id: process.env.QA_ORGANIZATION_A_ID,
      relationship_type: "management",
      pipeline_stage: "qualification",
      status: "active",
      confirmDuplicate: true
    });
    expect(created.status).toBe(201);
    expect(created.body.data?.pipeline_stage).toBe("qualification");

    const transition = await page.evaluate(async ({ relationshipId }) => {
      const response = await fetch(`/api/relationships/${relationshipId}/pipeline`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toStage: "conversation",
          expectedStage: "qualification",
          reason: "E2E pipeline transition"
        })
      });
      const body = await response.json() as { data?: { pipeline_stage?: string } };

      return { status: response.status, body };
    }, {
      relationshipId: created.body.data?.id
    });
    expect(transition.status).toBe(200);
    expect(transition.body.data?.pipeline_stage).toBe("conversation");
  });
});
