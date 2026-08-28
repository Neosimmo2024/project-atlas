import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd(), "../..");
const orchestrator = readFileSync(
  resolve(root, "apps/web/src/services/recruitment-email-orchestrator.ts"),
  "utf8"
);
const route = readFileSync(
  resolve(root, "apps/web/src/app/api/internal/recruitment-email/orchestrate/route.ts"),
  "utf8"
);
const brevo = readFileSync(resolve(root, "apps/web/src/services/brevo.ts"), "utf8");
const workflow = JSON.parse(
  readFileSync(resolve(root, "n8n/recruitment-email-follow-ups-lot-9b.json"), "utf8")
) as {
  active: boolean;
  nodes: Array<{ name: string; type: string; parameters: Record<string, unknown> }>;
};

describe("lot 9B recruitment n8n orchestration", () => {
  it("keeps Atlas as source of truth with J+3 and J+7 scheduling", () => {
    expect(orchestrator).toContain("scheduledAt(sequence.sent_at!, 3)");
    expect(orchestrator).toContain("scheduledAt(sequence.sent_at!, 7)");
    expect(orchestrator).toContain("claim_due_recruitment_email_steps");
    expect(orchestrator).toContain("complete_recruitment_email_step");
    expect(orchestrator).toContain("contact_allowed");
    expect(orchestrator).toContain("do_not_contact");
  });

  it("protects the worker endpoint with a server-only bearer secret", () => {
    expect(orchestrator).toContain("ATLAS_N8N_RECRUITMENT_SECRET");
    expect(orchestrator).toContain("timingSafeEqual");
    expect(route).toContain("isAuthorizedRecruitmentOrchestrator(request)");
    expect(route).toContain("status: 401");
    expect(route).toContain("runRecruitmentEmailOrchestration()");
  });

  it("uses dedicated Brevo templates and the step id as idempotency key", () => {
    expect(brevo).toContain("BREVO_RECRUITMENT_FOLLOW_UP_1_TEMPLATE_ID");
    expect(brevo).toContain("BREVO_RECRUITMENT_FOLLOW_UP_2_TEMPLATE_ID");
    expect(brevo).toContain("idempotencyKey: input.stepId");
    expect(brevo).toContain("sendRecruitmentFollowUpEmail");
  });

  it("ships an inactive n8n workflow scheduled every 15 minutes", () => {
    expect(workflow.active).toBe(false);
    const schedule = workflow.nodes.find((node) => node.type === "n8n-nodes-base.scheduleTrigger");
    const http = workflow.nodes.find((node) => node.type === "n8n-nodes-base.httpRequest");
    expect(schedule).toBeTruthy();
    expect(JSON.stringify(schedule?.parameters)).toContain('"minutesInterval":15');
    expect(http).toBeTruthy();
    expect(JSON.stringify(http?.parameters)).toContain("ATLAS_N8N_RECRUITMENT_ENDPOINT");
    expect(JSON.stringify(http?.parameters)).toContain("ATLAS_N8N_RECRUITMENT_SECRET");
  });
});
