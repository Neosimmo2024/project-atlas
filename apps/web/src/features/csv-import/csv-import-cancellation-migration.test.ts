import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "..", "..", "supabase", "migrations", "0012_csv_import_safe_cancellation.sql"),
  "utf8"
);

describe("CSV import safe cancellation migration", () => {
  it("adds durable tenant-scoped cancellation history with RLS", () => {
    expect(migration).toContain("create table if not exists public.csv_import_cancellations");
    expect(migration).toContain("import_run_id uuid not null references public.csv_import_runs");
    expect(migration).toContain("alter table public.csv_import_cancellations enable row level security");
    expect(migration).toContain("using (public.is_tenant_member(tenant_id))");
    expect(migration).toContain("grant select on table public.csv_import_cancellations to authenticated, service_role");
  });

  it("uses security-definer RPCs with explicit tenant, role and auth checks", () => {
    expect(migration).toContain("create or replace function public.analyze_csv_import_cancellation");
    expect(migration).toContain("create or replace function public.cancel_csv_import");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = public, pg_temp");
    expect(migration).toContain("auth.uid() <> p_actor_user_id");
    expect(migration).toContain("public.has_tenant_role(p_tenant_id, array['owner', 'admin'])");
  });

  it("protects idempotence and concurrent cancellation in PostgreSQL", () => {
    expect(migration).toContain("constraint csv_import_cancellations_import_unique unique (tenant_id, import_run_id)");
    expect(migration).toContain("constraint csv_import_cancellations_idempotency_unique unique (tenant_id, idempotency_key)");
    expect(migration).toContain("for update");
    expect(migration).toContain("Cet import possede deja une annulation avec une autre cle.");
    expect(migration).toContain("Idempotency key already belongs to a different cancellation.");
  });

  it("blocks dangerous dependencies and never removes relationships as import rollback data", () => {
    expect(migration).toContain("dependance_relationship");
    expect(migration).toContain("dependance_task");
    expect(migration).toContain("dependance_interaction");
    expect(migration).toContain("dependance_project");
    expect(migration).toContain("utilisee_par_un_autre_import");
    expect(migration).not.toMatch(/delete from public\.relationships/i);
  });

  it("does not expose direct execution to public or anon", () => {
    expect(migration).toContain("revoke execute on function public.cancel_csv_import(uuid, uuid, text, uuid, boolean) from public, anon");
    expect(migration).toContain("grant execute on function public.cancel_csv_import(uuid, uuid, text, uuid, boolean) to authenticated, service_role");
    expect(migration).toContain("revoke execute on function public._csv_import_created_entity_report(uuid, uuid) from public, anon, authenticated");
  });
});
