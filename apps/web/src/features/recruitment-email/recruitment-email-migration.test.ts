import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(resolve(process.cwd(), "../../supabase/migrations/0018_recruitment_initial_email_sequence.sql"), "utf8");

describe("lot 8 recruitment email migration", () => {
  it("isolates sequence state by tenant and prevents direct writes", () => {
    expect(migration).toContain("alter table public.recruitment_email_sequences enable row level security");
    expect(migration).toContain("public.is_tenant_member(tenant_id)");
    expect(migration).toContain("revoke insert, update, delete on table public.recruitment_email_sequences from authenticated");
    expect(migration).toContain("unique (tenant_id, person_id)");
  });

  it("derives identity and contact permission from trusted database state", () => {
    expect(migration).toContain("v_user_id uuid := auth.uid()");
    expect(migration).toContain("not v_person.contact_allowed or v_person.do_not_contact");
    expect(migration).toContain("public.has_tenant_role");
    expect(migration).toContain("PROVIDER_MESSAGE_ID_REQUIRED");
  });

  it("records queued, sent, error and stopped history", () => {
    for (const event of ["recruitment_email_queued", "recruitment_email_sent", "recruitment_email_error", "recruitment_email_stopped"]) {
      expect(migration).toContain(event);
    }
  });
});
