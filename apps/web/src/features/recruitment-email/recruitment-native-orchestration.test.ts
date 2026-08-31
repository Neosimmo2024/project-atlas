import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd(), "../..");
const orchestrator = readFileSync(resolve(root, "apps/web/src/services/recruitment-email-orchestrator.ts"), "utf8");
const route = readFileSync(resolve(root, "apps/web/src/app/api/internal/recruitment-email/orchestrate/route.ts"), "utf8");
const brevo = readFileSync(resolve(root, "apps/web/src/services/brevo.ts"), "utf8");
const bootstrap = readFileSync(resolve(root, "apps/web/src/services/recruitment-follow-up-template-bootstrap.ts"), "utf8");
const bootstrapRoute = readFileSync(resolve(root, "apps/web/src/app/api/internal/recruitment-email/bootstrap-follow-ups/route.ts"), "utf8");
const cron = readFileSync(resolve(root, "supabase/cron/recruitment-email-follow-ups-lot-9b.sql"), "utf8");

describe("lot 9B native recruitment orchestration", () => {
  it("keeps Atlas as source of truth with J+3 and J+7 scheduling", () => {
    expect(orchestrator).toContain("scheduledAt(sequence.sent_at!, 3)");
    expect(orchestrator).toContain("scheduledAt(sequence.sent_at!, 7)");
    expect(orchestrator).toContain("claim_due_recruitment_email_steps");
    expect(orchestrator).toContain("complete_recruitment_email_step");
    expect(orchestrator).toContain("contact_allowed");
    expect(orchestrator).toContain("do_not_contact");
  });

  it("protects internal endpoints with a bearer verified against Supabase Vault", () => {
    expect(orchestrator).toContain("verify_recruitment_cron_secret");
    expect(orchestrator).not.toContain("ATLAS_RECRUITMENT_CRON_SECRET");
    expect(route).toContain("await isAuthorizedRecruitmentOrchestrator(request)");
    expect(bootstrapRoute).toContain("await isAuthorizedRecruitmentOrchestrator(request)");
    expect(route).toContain("status: 401");
    expect(bootstrapRoute).toContain("status: 401");
    expect(cron).toContain("vault.decrypted_secrets");
    expect(cron).toContain("verify_recruitment_cron_secret");
  });

  it("uses follow-up template ids stored in Supabase Vault", () => {
    expect(brevo).toContain("get_recruitment_follow_up_template_id");
    expect(brevo).not.toContain("BREVO_RECRUITMENT_FOLLOW_UP_1_TEMPLATE_ID");
    expect(brevo).not.toContain("BREVO_RECRUITMENT_FOLLOW_UP_2_TEMPLATE_ID");
    expect(brevo).toContain("idempotencyKey: input.stepId");
    expect(cron).toContain("brevo_recruitment_follow_up_1_template_id");
    expect(cron).toContain("brevo_recruitment_follow_up_2_template_id");
  });

  it("locks the two user-approved follow-up messages and bootstraps without sending email", () => {
    expect(bootstrap).toContain("avez-vous eu le temps de voir mon message ?");
    expect(bootstrap).toContain("un dernier message avant de vous laisser tranquille");
    expect(bootstrap).toContain("sans engagement bien sûr");
    expect(bootstrap).toContain("nous pourrons éventuellement en reparler plus tard");
    expect(bootstrap).toContain("createBrevoRecruitmentTemplate");
    expect(bootstrapRoute).toContain("emailsSent: 0");
    expect(bootstrapRoute).not.toContain("sendRecruitmentFollowUpEmail");
  });

  it("ships a Supabase Cron recipe every 15 minutes", () => {
    expect(cron).toContain("create extension if not exists pg_cron");
    expect(cron).toContain("create extension if not exists pg_net");
    expect(cron).toContain("'*/15 * * * *'");
    expect(cron).toContain("REPLACE_WITH_AUTHORIZED_ATLAS_HOST");
    expect(cron).toContain("atlas_recruitment_cron_secret");
    expect(cron).toContain("NOT a migration");
  });

  it("contains no n8n dependency in the native lot 9B artifacts", () => {
    expect(orchestrator.toLowerCase()).not.toContain("n8n");
    expect(cron.toLowerCase()).not.toContain("n8n");
  });
});
