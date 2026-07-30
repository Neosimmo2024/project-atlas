import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "..", "..", "supabase", "migrations", "0011_csv_import_execution.sql"),
  "utf8"
);

describe("CSV import execution migration", () => {
  it("adds a tenant-scoped import history table with RLS", () => {
    expect(migration).toContain("create table if not exists public.csv_import_runs");
    expect(migration).toContain("tenant_id uuid not null references public.tenants");
    expect(migration).toContain("alter table public.csv_import_runs enable row level security");
    expect(migration).toContain("using (public.is_tenant_member(tenant_id))");
  });

  it("protects execution with an idempotency key and a security-definer transaction surface", () => {
    expect(migration).toContain("constraint csv_import_runs_tenant_idempotency_unique unique (tenant_id, idempotency_key)");
    expect(migration).toContain("create or replace function public.execute_csv_import");
    expect(migration).toContain("security definer");
    expect(migration).toContain("on conflict (tenant_id, idempotency_key) do nothing");
  });

  it("requires the authenticated user and recruiting roles before writing", () => {
    expect(migration).toContain("auth.uid() <> p_actor_user_id");
    expect(migration).toContain("public.has_tenant_role(p_tenant_id, array['owner', 'admin', 'recruiter', 'manager'])");
  });

  it("does not implement rollback, cancellation, Brevo, SMS, n8n or relationship automation", () => {
    expect(migration).not.toMatch(/cancel_import|rollback_import|brevo|sms|n8n/i);
    expect(migration).toContain("'relationshipsCreated', 0");
  });
});
