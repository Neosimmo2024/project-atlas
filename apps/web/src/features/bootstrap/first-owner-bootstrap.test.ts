import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(process.cwd(), "../..");
const bootstrapSql = readFileSync(join(repoRoot, "supabase/bootstrap/001_first_owner.sql"), "utf8");
const runbook = readFileSync(join(repoRoot, "docs/runbooks/first-owner-tenant-bootstrap.md"), "utf8");

describe("first owner bootstrap", () => {
  it("keeps personal identifiers and secrets out of tracked files", () => {
    const trackedText = `${bootstrapSql}\n${runbook}`;
    const uuidLiteralPattern = /'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/i;
    const serviceRolePattern = new RegExp(["service", "role"].join("[_-]?"), "i");

    expect(trackedText).not.toMatch(uuidLiteralPattern);
    expect(trackedText).not.toMatch(/neos-immo\.com/i);
    expect(trackedText).not.toMatch(serviceRolePattern);
    expect(trackedText).not.toContain("ATLAS_TEST_DB_URL=");
  });

  it("is psql-parameterized, transactional, and idempotent", () => {
    expect(bootstrapSql).toContain("\\set ON_ERROR_STOP on");
    expect(bootstrapSql).toContain("atlas_bootstrap_user_id");
    expect(bootstrapSql).toContain("atlas_bootstrap_user_email");
    expect(bootstrapSql).toContain("atlas_bootstrap_tenant_name");
    expect(bootstrapSql).toMatch(/\bbegin;\s*create temporary table/);
    expect(bootstrapSql).toMatch(/\bcommit;\s*$/);
    expect(bootstrapSql).toContain("on conflict (id) do update");
    expect(bootstrapSql).toContain("on conflict (tenant_id, user_id) do update");
    expect(bootstrapSql).toContain("where r.slug = 'owner'");
    expect(bootstrapSql).not.toMatch(/\b(role_id|owner_role_id)\s*:=\s*'[0-9a-f-]{36}'/i);
  });

  it("fails on ambiguous state before committing", () => {
    expect(bootstrapSql).toContain("auth_user_match_count <> 1");
    expect(bootstrapSql).toContain("auth_email_count <> 1");
    expect(bootstrapSql).toContain("tenant_match_count > 1");
    expect(bootstrapSql).toContain("owner_role_count <> 1");
    expect(bootstrapSql).toContain("other_active_memberships > 0");
    expect(bootstrapSql).toContain("other_active_owners > 0");
    expect(bootstrapSql).toContain("final_membership_count <> 1");
    expect(bootstrapSql).toContain("raise exception");
  });

  it("contains no destructive database operation or reset command", () => {
    expect(bootstrapSql).not.toMatch(/\bdelete\b/i);
    expect(bootstrapSql).not.toMatch(/\btruncate\b/i);
    expect(bootstrapSql).not.toMatch(/\bdrop\b/i);
    expect(bootstrapSql).not.toMatch(/\bsupabase\s+db\s+reset\b/i);
    expect(bootstrapSql).not.toMatch(/\bsupabase\s+db\s+push\b/i);
  });

  it("documents the manual command and post-run checks", () => {
    expect(runbook).toContain("psql");
    expect(runbook).toContain("supabase/bootstrap/001_first_owner.sql");
    expect(runbook).toContain("Atlas Test Tenant");
    expect(runbook).toContain("After Execution");
    expect(runbook).toContain("role slug `owner`");
    expect(runbook).toContain("tenant user status `active`");
  });
});
