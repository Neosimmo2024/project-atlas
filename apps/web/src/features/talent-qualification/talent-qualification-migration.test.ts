import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(resolve(process.cwd(), "../../supabase/migrations/0017_talent_qualifications.sql"), "utf8");

describe("lot 6 qualification migration", () => {
  it("isolates qualifications by tenant with RLS", () => {
    expect(migration).toContain("alter table public.talent_qualifications enable row level security");
    expect(migration).toContain("public.is_tenant_member(tenant_id)");
    expect(migration).toContain("public.has_tenant_role(tenant_id");
  });

  it("derives the tenant and actor on the server", () => {
    expect(migration).toContain("v_user_id uuid := auth.uid()");
    expect(migration).toContain("select p.tenant_id into v_tenant_id");
    expect(migration).toContain("updated_by = auth.uid()");
    expect(migration).toContain("security definer");
    expect(migration).toContain("revoke insert, update, delete on table public.talent_qualifications from authenticated");
  });

  it("keeps draft and completed states consistent and auditable", () => {
    expect(migration).toContain("state in ('draft', 'completed')");
    expect(migration).toContain("QUALIFICATION_CONCLUSION_REQUIRED");
    expect(migration).toContain("audit_talent_qualifications_changes");
    expect(migration).toContain("updated_by_label");
  });
});
