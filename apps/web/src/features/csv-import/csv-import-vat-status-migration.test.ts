import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "..", "..", "supabase", "migrations", "0014_organization_vat_status.sql"),
  "utf8"
);

describe("CSV import VAT status migration", () => {
  it("adds an optional constrained organization VAT status", () => {
    expect(migration).toContain("add column if not exists vat_status text");
    expect(migration).toContain("organizations_vat_status_allowed");
    expect(migration).toContain("vat_status in ('assujetti', 'non_assujetti', 'a_verifier')");
  });

  it("normalizes VAT values server-side without exposing helper functions", () => {
    expect(migration).toContain("create or replace function public._csv_import_normalize_vat_status");
    expect(migration).toContain("return 'assujetti'");
    expect(migration).toContain("return 'non_assujetti'");
    expect(migration).toContain("return 'a_verifier'");
    expect(migration).toContain("revoke execute on function public._csv_import_normalize_vat_status(text) from public, anon, authenticated");
  });

  it("wraps CSV execution without reopening direct RPC access", () => {
    expect(migration).toContain("rename to _execute_csv_import_without_vat");
    expect(migration).toContain("public._execute_csv_import_without_vat(");
    expect(migration).toContain("vat_status is null");
    expect(migration).toContain("grant execute on function public.execute_csv_import(uuid, text, text, text, jsonb, uuid, boolean)");
    expect(migration).toContain("to service_role");
    expect(migration).not.toMatch(/grant execute on function public\.execute_csv_import\(uuid, text, text, text, jsonb, uuid, boolean\)\s+to\s+(public|anon|authenticated)/i);
  });
});
