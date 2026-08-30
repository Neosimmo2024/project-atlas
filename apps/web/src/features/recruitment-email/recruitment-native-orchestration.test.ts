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
const cron = readFileSync(
  resolve(root, "supabase/cron/recruitment-email-follow-ups-lot-9b.sql"),
  "utf8"
);

describe("lot 9B native recruitment orchestration", () => {
  it("keeps Atlas as source of truth with J+3 and J+7 scheduling", () => {
    expect(orchestrator).toContain("scheduledAt(sequence.sent_at!, 3)");
    expect(orchestrator).toContain("scheduledAt(sequence.sent_at!, 7)");
    expect(orchestrator).toContain("claim_due_recruitment_email_steps");
    expect(orchestrator).toContain("complete_recruitment_email_step");
    expect(orchestrator).toContain("contact_allowed");
    expect(orchestrator).toContain("do_not_contact");
  });

  it("protects the worker endpoint with a server-only cron secret", () => {
    expect(orchestrator).toContain("ATLAS_RECRUITMENT_CRON_SECRET");
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

  it("ships an inactive-by-default Supabase Cron recipe every 15 minutes", () => {
    expect(cron).toContain("create extension if not exists pg_cron");
    expect(cron).toContain("create extension if not exists pg_net");
    expect(cron).toContain("'*/15 * * * *'");
    expect(cron).toContain("REPLACE_WITH_AUTHORIZED_ATLAS_HOST");
    expect(cron).toContain("vault.decrypted_secrets");
    expect(cron).toContain("atlas_recruitment_cron_secret");
    expect(cron).not.toContain("REPLACE_WITH_SERVER_SECRET");
    expect(cron).toContain("NOT a migration");
  });

  it("contains no n8n dependency in the native lot 9B artifacts", () => {
    expect(orchestrator.toLowerCase()).not.toContain("n8n");
    expect(cron.toLowerCase()).not.toContain("n8n");
  });
});
