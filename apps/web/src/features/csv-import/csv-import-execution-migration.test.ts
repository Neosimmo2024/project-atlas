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
    expect(migration).toContain("payload_fingerprint text not null");
    expect(migration).toContain("v_payload_fingerprint := md5(p_rows::text)");
    expect(migration).toContain("create or replace function public.execute_csv_import");
    expect(migration).toContain("security definer");
    expect(migration).toContain("on conflict (tenant_id, idempotency_key) do nothing");
    expect(migration).toContain("v_existing.analysis_fingerprint <> p_analysis_fingerprint");
    expect(migration).toContain("v_existing.payload_fingerprint <> v_payload_fingerprint");
    expect(migration).toContain("Idempotency key already belongs to a different import payload.");
  });

  it("requires the authenticated user and recruiting roles before writing", () => {
    expect(migration).toContain("auth.uid() <> p_actor_user_id");
    expect(migration).toContain("public.has_tenant_role(p_tenant_id, array['owner', 'admin', 'recruiter', 'manager'])");
  });

  it("keeps direct RPC calls from linking without an accessible target and reports committed outcomes", () => {
    expect(migration).toContain("Line % must include an accessible target to link.");
    expect(migration).toContain("'outcome', case when v_created_person_id is not null or v_created_organization_id is not null then 'created' else 'linked' end");
  });

  it("does not leave implicit execute privileges on the security-definer RPC", () => {
    expect(migration).toContain("set search_path = public, pg_temp");
    expect(migration).toContain("revoke execute on function public.execute_csv_import(uuid, text, text, text, jsonb, uuid) from public, anon");
    expect(migration).toContain("grant execute on function public.execute_csv_import(uuid, text, text, text, jsonb, uuid) to authenticated, service_role");
  });

  it("does not implement rollback, cancellation, Brevo, SMS, n8n or relationship automation", () => {
    expect(migration).not.toMatch(/cancel_import|rollback_import|brevo|sms|n8n/i);
    expect(migration).toContain("'relationshipsCreated', 0");
  });
});
