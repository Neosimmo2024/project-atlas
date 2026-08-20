import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "../../supabase/migrations/0019_recruitment_email_template_management.sql"), "utf8");

describe("recruitment email template management migration", () => {
  it("stores immutable tenant-scoped versions with one active version", () => {
    expect(migration).toContain("create table public.recruitment_email_template_versions");
    expect(migration).toContain("unique (tenant_id, template_key, version_number)");
    expect(migration).toContain("where status = 'active'");
    expect(migration).toContain("alter table public.recruitment_email_template_versions enable row level security");
    expect(migration).toContain("public.is_tenant_member(tenant_id)");
  });

  it("prevents direct writes and restricts version management to owner and admin", () => {
    expect(migration).toContain("revoke insert, update, delete on table public.recruitment_email_template_versions from authenticated");
    expect(migration).toContain("public.has_tenant_role(p_tenant_id, array['owner', 'admin'])");
    expect(migration).toContain("public.has_tenant_role(v_version.tenant_id, array['owner', 'admin'])");
    expect(migration).toContain("revoke all on function public.create_recruitment_email_template_version");
  });

  it("activates atomically and records Brevo sync failures", () => {
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("p_brevo_template_id bigint");
    expect(migration).toContain("set status = 'synced'");
    expect(migration).toContain("set status = 'active', brevo_template_id = p_brevo_template_id");
    expect(migration).toContain("mark_recruitment_email_template_sync_error");
  });
});
