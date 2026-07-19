import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../../../..");
const workflow = readFileSync(resolve(root, ".github/workflows/supabase-test-reset.yml"), "utf8");
const runbook = readFileSync(resolve(root, "docs/runbooks/supabase-test-reset.md"), "utf8");

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
    expect(workflow).toContain('if [ "$actual_sha" != "$AUTHORIZED_SHA_INPUT" ]');
    expect(workflow).toContain("Refusing reset: unauthorized project_ref.");
    expect(workflow).toContain("Refusing reset: confirmation phrase does not match.");
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

  it("stops on conservative counters and impossible alternate targets", () => {
    expect(workflow).toContain("auth.users', 1, 1");
    expect(workflow).toContain("storage.buckets', 0, 0");
    expect(workflow).toContain("storage.objects', 0, 0");
    expect(workflow).toContain("public.timeline_events', 9, 9");
    expect(workflow).toContain("Refusing reset: one or more table counts exceed the conservative test-project ceilings.");
    expect(workflow).not.toContain("SUPABASE_PROJECT_REF");
    expect(workflow).not.toContain("on commit drop");
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
