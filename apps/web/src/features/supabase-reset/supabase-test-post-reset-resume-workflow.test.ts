import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../../../..");
const workflow = readFileSync(resolve(root, ".github/workflows/supabase-test-post-reset-resume.yml"), "utf8").replace(/\r\n/g, "\n");
const runbook = readFileSync(resolve(root, "docs/runbooks/supabase-test-post-reset-resume.md"), "utf8").replace(/\r\n/g, "\n");

describe("Supabase test post-reset resume workflow", () => {
  it("is manual only and uses protected environment approval", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toMatch(/\n\s+push:/);
    expect(workflow).not.toMatch(/\n\s+pull_request:/);
    expect(workflow).not.toMatch(/\n\s+schedule:/);
    expect(workflow).toContain("permissions:\n  contents: read");
    expect(workflow).toContain("environment: atlas-test-reset");
    expect(workflow).toContain("timeout-minutes: 25");
  });

  it("locks the target, resume phrase, explicit flag, and authorized SHA", () => {
    expect(workflow).toContain("ALLOWED_PROJECT_REF: aqmuvakvienfwzhgzhcw");
    expect(workflow).toContain("POST_RESET_BASE_SHA: 2300e42d6249ee15f537ffac41cb61693d4d6bc4");
    expect(workflow).toContain("EXPECTED_CONFIRMATION: RESUME PLATEFORME RECRUTEMENT TEST");
    expect(workflow).toContain('if [ "$PROJECT_REF_INPUT" != "$ALLOWED_PROJECT_REF" ]');
    expect(workflow).toContain('if [ "$CONFIRMATION_INPUT" != "$EXPECTED_CONFIRMATION" ]');
    expect(workflow).toContain('if [ "$APPLY_RESUME_INPUT" != "true" ]');
    expect(workflow).toContain('if ! [[ "$AUTHORIZED_SHA_INPUT" =~ ^[0-9a-f]{40}$ ]]');
    expect(workflow).toContain("ref: ${{ inputs.authorized_sha }}");
    expect(workflow).toContain("fetch-depth: 0");
    expect(workflow).toContain('git merge-base --is-ancestor "$POST_RESET_BASE_SHA" HEAD');
  });

  it("does not contain destructive reset, push, migration, or SQL cleanup commands", () => {
    expect(workflow).not.toMatch(/supabase\s+db\s+reset/);
    expect(workflow).not.toMatch(/supabase\s+db\s+push/);
    expect(workflow).not.toMatch(/supabase\s+migration\s+up\s+--linked/);
    expect(workflow).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(workflow).not.toMatch(/\bTRUNCATE\b/i);
    expect(workflow).not.toMatch(/\bDROP\s+(SCHEMA|TABLE|DATABASE)\b/i);
    expect(runbook).toContain("must never run `supabase db reset`");
    expect(runbook).toContain("must never run `supabase db push`");
  });

  it("uses bounded Session Pooler retries through the locked IPv4 pooler", () => {
    expect(workflow).toContain("SUPABASE_POOLER_HOST: aws-0-eu-central-1.pooler.supabase.com");
    expect(workflow).toContain("SUPABASE_POOLER_PORT: 5432");
    expect(workflow).toContain("SUPABASE_POOLER_USER: postgres.aqmuvakvienfwzhgzhcw");
    expect(workflow).toContain("POOLER_READY_MAX_ATTEMPTS: 24");
    expect(workflow).toContain("POOLER_READY_DELAY_SECONDS: 15");
    expect(workflow).toContain("for attempt in $(seq 1 \"$max_attempts\")");
    expect(workflow).toContain("--username=\"postgres.aqmuvakvienfwzhgzhcw\"");
    expect(workflow).toContain("Refusing resume: Session Pooler did not become ready within the bounded wait window.");
    expect(workflow).not.toContain("db.aqmuvakvienfwzhgzhcw.supabase.co");
  });

  it("verifies migrations, schema, RLS, privileges, RPC, PostgREST, and auth.users", () => {
    for (const migration of ["0001", "0002", "0003", "0004", "0005", "0006", "0007", "0008", "0009", "0010"]) {
      expect(workflow).toContain(migration);
    }
    expect(workflow).toContain("supabase_migrations.schema_migrations");
    expect(workflow).toContain("public.recruitment_pipeline_events");
    expect(workflow).toContain("c.relrowsecurity");
    expect(workflow).toContain("has_table_privilege('authenticated', 'public.projects', 'select')");
    expect(workflow).toContain("has_function_privilege('authenticated', 'public.transition_recruitment_pipeline");
    expect(workflow).toContain("notify pgrst, 'reload schema'");
    expect(workflow).toContain("select count(*) into total_users from auth.users");
    expect(workflow).toContain("Expected exactly one Auth user matching ATLAS_TEST_OWNER_EMAIL before owner bootstrap.");
  });

  it("bootstraps the first owner idempotently without exposing secrets", () => {
    expect(workflow).toContain("on conflict (id) do update set");
    expect(workflow).toContain("on conflict (tenant_id, user_id) do update set");
    expect(workflow).toContain("Atlas Test Tenant");
    expect(workflow).toContain("::add-mask::$SUPABASE_DB_PASSWORD");
    expect(workflow).toContain("::add-mask::$ATLAS_TEST_OWNER_EMAIL");
    expect(workflow).not.toContain("sb_secret_");
    expect(workflow).not.toContain("sb_publishable_");
    expect(runbook).toContain("The bootstrap is idempotent");
  });
});
