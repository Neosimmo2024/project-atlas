import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../../../..");
const workflow = readFileSync(resolve(root, ".github/workflows/supabase-test-reset.yml"), "utf8").replace(/\r\n/g, "\n");
const runbook = readFileSync(resolve(root, "docs/runbooks/supabase-test-reset.md"), "utf8").replace(/\r\n/g, "\n");

describe("Supabase test reset workflow", () => {
  it("is manual only and cannot run from push, pull_request, or schedule", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toMatch(/\n\s+push:/);
    expect(workflow).not.toMatch(/\n\s+pull_request:/);
    expect(workflow).not.toMatch(/\n\s+schedule:/);
  });

  it("locks the authorized project, confirmation phrase, and explicit reset flag", () => {
    expect(workflow).toContain("ALLOWED_PROJECT_REF: aqmuvakvienfwzhgzhcw");
    expect(workflow).toContain("EXPECTED_CONFIRMATION: RESET PLATEFORME RECRUTEMENT TEST");
    expect(workflow).toContain('if [ "$APPLY_RESET_INPUT" != "true" ]');
    expect(workflow).toContain('if ! [[ "$AUTHORIZED_SHA_INPUT" =~ ^[0-9a-f]{40}$ ]]');
    expect(workflow).toContain("ref: ${{ inputs.authorized_sha }}");
    expect(workflow).toContain("fetch-depth: 0");
    expect(workflow).toContain('if [ "$actual_sha" != "$AUTHORIZED_SHA_INPUT" ]');
    expect(workflow).toContain("Refusing reset: unauthorized project_ref.");
    expect(workflow).toContain("Refusing reset: confirmation phrase does not match.");
  });

  it("fetches enough Git history to verify the validated main ancestry", () => {
    const checkoutIndex = workflow.indexOf("uses: actions/checkout@v4");
    const fetchDepthIndex = workflow.indexOf("fetch-depth: 0");
    const ancestryGuardIndex = workflow.indexOf('git merge-base --is-ancestor "$EXPECTED_BASE_SHA" HEAD');

    expect(checkoutIndex).toBeGreaterThan(-1);
    expect(fetchDepthIndex).toBeGreaterThan(checkoutIndex);
    expect(fetchDepthIndex).toBeLessThan(ancestryGuardIndex);
    expect(workflow).toContain("Refusing reset: workflow checkout is not based on the validated main SHA.");
  });

  it("uses minimal GitHub permissions, environment approval, timeout, and concurrency", () => {
    expect(workflow).toContain("permissions:\n  contents: read");
    expect(workflow).toContain("environment: atlas-test-reset");
    expect(workflow).toContain("timeout-minutes: 35");
    expect(workflow).toContain("concurrency:");
    expect(workflow).toContain("cancel-in-progress: false");
  });

  it("requires dedicated secrets without hardcoding their values", () => {
    for (const secretName of ["SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD", "ATLAS_TEST_OWNER_EMAIL"]) {
      expect(workflow).toContain(`secrets.${secretName}`);
      expect(workflow).toContain(`Missing required GitHub secret: ${secretName}`);
    }
    expect(workflow).not.toContain("sb_secret_");
    expect(workflow).not.toContain("sb_publishable_");
  });

  it("uses the official linked reset with no automatic seed", () => {
    expect(workflow).toContain("supabase db reset --linked --no-seed --yes");
    expect(workflow).not.toContain("--include-seed");
    expect(workflow).not.toContain("DELETE FROM");
    expect(workflow).not.toContain("TRUNCATE ");
    expect(workflow).not.toContain("DROP SCHEMA");
  });

  it("uses the locked IPv4 Session Pooler for psql checks instead of the direct database host", () => {
    const configureConnectionIndex = workflow.indexOf("- name: Configure masked database connection");
    const firstPsqlIndex = workflow.indexOf("psql \\");

    expect(workflow).toContain("SUPABASE_POOLER_HOST: aws-0-eu-central-1.pooler.supabase.com");
    expect(workflow).toContain("SUPABASE_POOLER_PORT: 5432");
    expect(workflow).toContain("SUPABASE_POOLER_USER: postgres.aqmuvakvienfwzhgzhcw");
    expect(workflow).toContain('if [ "$SUPABASE_POOLER_HOST" != "aws-0-eu-central-1.pooler.supabase.com" ]');
    expect(workflow).toContain('if [ "$SUPABASE_POOLER_USER" != "postgres.$ALLOWED_PROJECT_REF" ]');
    expect(workflow).toContain('echo "PGUSER=postgres.aqmuvakvienfwzhgzhcw"');
    expect(workflow).toContain('echo "PGSSLMODE=require"');
    expect(workflow).toContain('--username="postgres.aqmuvakvienfwzhgzhcw"');
    expect(workflow).not.toContain("PGHOST=db.$ALLOWED_PROJECT_REF.supabase.co");
    expect(workflow).not.toContain("db.aqmuvakvienfwzhgzhcw.supabase.co");
    expect(workflow).not.toContain('echo "PGUSER=postgres"');
    expect(workflow).not.toMatch(/psql -X -v ON_ERROR_STOP=1/);
    expect(configureConnectionIndex).toBeGreaterThan(-1);
    expect(firstPsqlIndex).toBeGreaterThan(configureConnectionIndex);
  });

  it("passes the full Session Pooler username explicitly to every remote psql command", () => {
    const remotePsqlCommands = [...workflow.matchAll(/\n\s+psql \\\n(?:\s+.*\\\n)+/g)];

    expect(remotePsqlCommands).toHaveLength(4);
    for (const [command] of remotePsqlCommands) {
      expect(command).toContain("--host=\"$SUPABASE_POOLER_HOST\"");
      expect(command).toContain("--port=\"$SUPABASE_POOLER_PORT\"");
      expect(command).toContain("--dbname=postgres");
      expect(command).toContain("--username=\"postgres.aqmuvakvienfwzhgzhcw\"");
      expect(command).not.toContain("--username=\"postgres\"");
    }
  });

  it("requires exactly canonical migrations 0001 through 0010", () => {
    const migrations = readdirSync(resolve(root, "supabase/migrations")).filter((name) => name.endsWith(".sql")).sort();
    expect(migrations).toEqual([
      "0001_core.sql",
      "0002_organizations_module.sql",
      "0003_relationships_module.sql",
      "0004_interactions_module.sql",
      "0005_tasks_module.sql",
      "0006_timeline_events.sql",
      "0007_action_plan_engine.sql",
      "0008_projects_foundation.sql",
      "0009_api_permissions_hardening.sql",
      "0010_recruitment_pipeline_domain.sql"
    ]);
    expect(workflow).toContain("Refusing reset: migration set is not exactly 0001 through 0010.");
  });

  it("stops unless the exact authorized pre-reset snapshot matches", () => {
    for (const [table, count] of [
      ["auth.users", 1],
      ["public.tenants", 1],
      ["public.tenant_users", 1],
      ["public.profiles", 1],
      ["public.people", 1],
      ["public.organizations", 1],
      ["public.relationships", 1],
      ["public.interactions", 4],
      ["public.tasks", 4],
      ["public.timeline_events", 9],
      ["public.audit_log", 29],
      ["public.action_plan_decisions", 0],
      ["storage.buckets", 0],
      ["storage.objects", 0]
    ] as const) {
      expect(workflow).toContain(`('${table}', ${count})`);
    }
    expect(workflow).toContain("where o.observed_count is distinct from e.expected_count");
    expect(workflow).toContain("pre_reset_mismatch table=");
    expect(workflow).toContain("expected=");
    expect(workflow).toContain("observed=");
    expect(workflow).toContain("coalesce(o.observed_count::text, 'NULL')");
    expect(workflow).toContain('psql \\\n            --host="$SUPABASE_POOLER_HOST"');
    expect(workflow).toContain("observed_count integer not null");
    expect(workflow).toContain("Refusing reset: pre-reset table counts differ from the exact authorized snapshot.");
    expect(workflow).not.toContain("max_count");
    expect(workflow).not.toContain("ceilings");
    expect(workflow).not.toContain("o.observed_count >");
    expect(workflow).not.toContain("no auth.users row was found before reset");
    expect(workflow).not.toContain("SUPABASE_PROJECT_REF");
    expect(workflow).not.toContain("on commit drop");
  });

  it("keeps the destructive reset unreachable until the exact snapshot guard passes", () => {
    const guardIndex = workflow.indexOf("Refusing reset: pre-reset table counts differ from the exact authorized snapshot.");
    const resetIndex = workflow.indexOf("supabase db reset --linked --no-seed --yes");

    expect(guardIndex).toBeGreaterThan(-1);
    expect(resetIndex).toBeGreaterThan(guardIndex);
    expect(workflow).toContain("set -euo pipefail");
  });

  it("does not let workflow inputs replace the authorized snapshot", () => {
    expect(workflow).not.toContain("inputs.expected_count");
    expect(workflow).not.toContain("inputs.max_count");
    expect(workflow).not.toContain("EXPECTED_COUNTS_INPUT");
    expect(workflow).not.toContain("SNAPSHOT_INPUT");
  });

  it("documents owner bootstrap, auth.users behavior, and human cleanup", () => {
    expect(runbook).toContain("do not assume `auth.users` is deleted");
    expect(runbook).toContain("Storage is treated as managed Supabase state");
    expect(runbook).toContain("use the exact merge commit SHA");
    expect(runbook).toContain("ATLAS_TEST_OWNER_EMAIL");
    expect(runbook).toContain("Remove or rotate `SUPABASE_ACCESS_TOKEN`");
    expect(runbook).toContain("No other project ref is accepted");
  });
});
