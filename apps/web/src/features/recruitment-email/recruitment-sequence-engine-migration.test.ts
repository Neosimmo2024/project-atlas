import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(process.cwd(), "../../supabase/migrations/0020_recruitment_sequence_engine.sql"),
  "utf8"
);

describe("lot 9A recruitment sequence engine migration", () => {
  it("adds explicit lifecycle, scheduling and attempt state", () => {
    for (const token of [
      "lifecycle_status",
      "current_step",
      "next_action_at",
      "attempt_count",
      "last_attempt_at",
      "completed_at",
      "stop_reason"
    ]) {
      expect(migration).toContain(token);
    }
    expect(migration).toContain("create table public.recruitment_email_sequence_steps");
    expect(migration).toContain("create table public.recruitment_email_sequence_attempts");
  });

  it("keeps Lot 8 sent sequences eligible for follow-ups", () => {
    expect(migration).toContain("when 'sent' then 'idle'");
    expect(migration).toContain("if v_sequence.status <> 'sent'");
    expect(migration).toContain("follow_up_1");
    expect(migration).toContain("follow_up_2");
  });

  it("enforces ordering, contact permission and one active follow-up", () => {
    expect(migration).toContain("PREVIOUS_STEP_NOT_SENT");
    expect(migration).toContain("ANOTHER_STEP_ALREADY_ACTIVE");
    expect(migration).toContain("not v_person.contact_allowed or v_person.do_not_contact");
    expect(migration).toContain("STEP_ALREADY_CLAIMED_OR_SENT");
  });

  it("provides idempotent worker claim/completion primitives", () => {
    expect(migration).toContain("for update of s skip locked");
    expect(migration).toContain("claim_due_recruitment_email_steps");
    expect(migration).toContain("complete_recruitment_email_step");
    expect(migration).toContain("recruitment_email_sequence_attempts_step_number_unique");
    expect(migration).toContain("PROVIDER_MESSAGE_ID_REQUIRED");
  });

  it("restricts worker functions to service role and protects tenant data", () => {
    expect(migration).toContain("alter table public.recruitment_email_sequence_steps enable row level security");
    expect(migration).toContain("alter table public.recruitment_email_sequence_attempts enable row level security");
    expect(migration).toContain("public.is_tenant_member(tenant_id)");
    expect(migration).toContain("grant execute on function public.claim_due_recruitment_email_steps(integer) to service_role");
    expect(migration).toContain("grant execute on function public.complete_recruitment_email_step(uuid, boolean, text, text) to service_role");
  });
});
