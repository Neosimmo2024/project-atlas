import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

export const LOCAL_PROJECT_REF = "atlas-local-reset-simulation";
export const EXPECTED_CONFIRMATION = "RESET PLATEFORME RECRUTEMENT TEST";
export const EXPECTED_MIGRATIONS = [
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
];
export const EXPECTED_COUNTS = Object.freeze({
  "auth.users": 1,
  "storage.buckets": 0,
  "storage.objects": 0,
  "public.tenants": 1,
  "public.tenant_users": 1,
  "public.profiles": 1,
  "public.people": 1,
  "public.organizations": 1,
  "public.relationships": 1,
  "public.interactions": 4,
  "public.tasks": 4,
  "public.timeline_events": 9,
  "public.audit_log": 29,
  "public.action_plan_decisions": 0
});

const __filename = fileURLToPath(import.meta.url);
const root = resolve(__filename, "..", "..");
const ownerEmail = "local-reset-owner@atlas.local.test";
const extraOwnerEmail = "local-reset-extra-owner@atlas.local.test";
const ownerPassword = "LocalResetSimulationPassword-ChangeMe-OnlyLocal-1";
let hasPsql;
const ids = Object.freeze({
  tenant: "11111111-1111-4111-8111-111111111111",
  person: "22222222-2222-4222-8222-222222222222",
  organization: "33333333-3333-4333-8333-333333333333",
  relationship: "44444444-4444-4444-8444-444444444444",
  interactions: [
    "55555555-5555-4555-8555-555555555551",
    "55555555-5555-4555-8555-555555555552",
    "55555555-5555-4555-8555-555555555553",
    "55555555-5555-4555-8555-555555555554"
  ],
  tasks: [
    "66666666-6666-4666-8666-666666666661",
    "66666666-6666-4666-8666-666666666662",
    "66666666-6666-4666-8666-666666666663",
    "66666666-6666-4666-8666-666666666664"
  ]
});

export function validateManualResetInputs({
  projectRef,
  confirmation,
  applyReset,
  authorizedSha,
  actualSha = authorizedSha,
  allowedProjectRef = LOCAL_PROJECT_REF
}) {
  if (projectRef !== allowedProjectRef) {
    throw new Error("Refusing reset: unauthorized project_ref.");
  }
  if (confirmation !== EXPECTED_CONFIRMATION) {
    throw new Error("Refusing reset: confirmation phrase does not match.");
  }
  if (applyReset !== true) {
    throw new Error("Refusing reset: apply_reset must be true.");
  }
  if (!/^[0-9a-f]{40}$/.test(authorizedSha ?? "")) {
    throw new Error("Refusing reset: authorized_sha must be a full 40-character commit SHA.");
  }
  if (actualSha !== authorizedSha) {
    throw new Error("Refusing reset: checked-out SHA does not match authorized_sha.");
  }
}

export function evaluateSnapshotCounts(observedCounts, expectedCounts = EXPECTED_COUNTS) {
  return Object.entries(expectedCounts).flatMap(([tableName, expected]) => {
    const observed = observedCounts[tableName];
    if (observed !== expected) {
      return [{ tableName, expected, observed: observed ?? null }];
    }
    return [];
  });
}

export function assertExactSnapshotCounts(observedCounts, expectedCounts = EXPECTED_COUNTS) {
  const mismatches = evaluateSnapshotCounts(observedCounts, expectedCounts);
  if (mismatches.length > 0) {
    const details = mismatches
      .map((mismatch) => `table=${mismatch.tableName} expected=${mismatch.expected} observed=${mismatch.observed}`)
      .join("; ");
    throw new Error(`Refusing reset: pre-reset table counts differ from the exact authorized snapshot. ${details}`);
  }
}

export function assertLocalOnlyEnvironment(env = process.env) {
  for (const name of ["QA_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]) {
    const value = env[name];
    if (value) assertLocalUrl(name, value);
  }
  if (env.QA_DB_URL) assertLocalPostgresUrl("QA_DB_URL", env.QA_DB_URL);
}

function assertLocalUrl(name, value) {
  const parsed = new URL(value);
  if (!["http:", "https:"].includes(parsed.protocol) || !isLocalHost(parsed.hostname)) {
    throw new Error(`${name} must target localhost or 127.0.0.1 for reset simulation.`);
  }
}

function assertLocalPostgresUrl(name, value) {
  const parsed = new URL(value);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol) || !isLocalHost(parsed.hostname)) {
    throw new Error(`${name} must target a local PostgreSQL host for reset simulation.`);
  }
}

function isLocalHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

function adminClient() {
  const url = process.env.QA_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.QA_SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("Missing QA_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL");
  if (!key) throw new Error("Missing QA_SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

async function run(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: root,
    shell: process.platform === "win32",
    stdio: ["pipe", "pipe", "pipe"],
    ...options
  });

  let stdout = "";
  let stderr = "";
  if (child.stdin && options.input) {
    child.stdin.end(options.input);
  } else if (child.stdin) {
    child.stdin.end();
  }
  child.stdout?.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr?.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const code = await new Promise((resolveCode, reject) => {
    child.on("error", reject);
    child.on("close", resolveCode);
  });
  if (code !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with code ${code}: ${stderr || stdout}`);
  }
  return stdout.trim();
}

function supabaseCliParts() {
  return {
    command: process.env.SUPABASE_CLI_COMMAND ?? "supabase",
    args: (process.env.SUPABASE_CLI_ARGS ?? "").split(" ").filter(Boolean)
  };
}

async function runSupabase(args, options = {}) {
  const cli = supabaseCliParts();
  return run(cli.command, [...cli.args, ...args], options);
}

async function commandAvailable(command) {
  try {
    await run(command, ["--version"]);
    return true;
  } catch {
    return false;
  }
}

async function canUsePsql() {
  hasPsql ??= await commandAvailable("psql");
  return hasPsql;
}

async function withSqlFile(sql, operation) {
  const directory = mkdtempSync(resolve(tmpdir(), "atlas-reset-simulation-"));
  const file = resolve(directory, "query.sql");
  writeFileSync(file, sql);
  try {
    return await operation(file);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

async function executeSql(sql) {
  const dbUrl = process.env.QA_DB_URL;
  if (!dbUrl) throw new Error("Missing QA_DB_URL");
  if (await canUsePsql()) {
    await run("psql", [dbUrl, "-X", "-v", "ON_ERROR_STOP=1"], { input: sql });
    return;
  }
  await withSqlFile(sql, (file) => runSupabase(["db", "query", "--db-url", dbUrl, "--file", file, "--output", "json"]));
}

async function querySingleValue(sql) {
  const dbUrl = process.env.QA_DB_URL;
  if (!dbUrl) throw new Error("Missing QA_DB_URL");
  if (await canUsePsql()) {
    return run("psql", [dbUrl, "-X", "-v", "ON_ERROR_STOP=1", "-t", "-A"], { input: sql });
  }
  const output = await withSqlFile(sql, (file) =>
    runSupabase(["db", "query", "--db-url", dbUrl, "--file", file, "--output", "json"])
  );
  const rows = JSON.parse(output);
  const first = rows[0];
  if (!first) return "";
  if ("result" in first) return String(first.result ?? "");
  const [value] = Object.values(first);
  return String(value ?? "");
}

function verifyMigrationSet() {
  const migrations = readdirSync(resolve(root, "supabase", "migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const actual = migrations.join("\n");
  const expected = EXPECTED_MIGRATIONS.join("\n");
  if (actual !== expected) {
    throw new Error("Migration set is not exactly 0001 through 0010.");
  }
}

async function createAuthUser(email) {
  const supabase = adminClient();
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: ownerPassword,
    email_confirm: true,
    user_metadata: {
      full_name: "Atlas Local Reset Owner"
    }
  });
  if (error) throw new Error(`create auth user ${email}: ${error.message}`);
  if (!data.user?.id) throw new Error(`create auth user ${email}: missing user id`);
  return data.user.id;
}

async function deleteAuthUser(userId) {
  const { error } = await adminClient().auth.admin.deleteUser(userId);
  if (error) throw new Error(`delete auth user ${userId}: ${error.message}`);
}

async function fetchActualCounts() {
  const output = await querySingleValue(`
select jsonb_object_agg(table_name, observed_count order by table_name)::text as result
from (
  select 'auth.users' as table_name, count(*)::integer as observed_count from auth.users
  union all select 'storage.buckets', count(*)::integer from storage.buckets
  union all select 'storage.objects', count(*)::integer from storage.objects
  union all select 'public.tenants', count(*)::integer from public.tenants
  union all select 'public.tenant_users', count(*)::integer from public.tenant_users
  union all select 'public.profiles', count(*)::integer from public.profiles
  union all select 'public.people', count(*)::integer from public.people
  union all select 'public.organizations', count(*)::integer from public.organizations
  union all select 'public.relationships', count(*)::integer from public.relationships
  union all select 'public.interactions', count(*)::integer from public.interactions
  union all select 'public.tasks', count(*)::integer from public.tasks
  union all select 'public.timeline_events', count(*)::integer from public.timeline_events
  union all select 'public.audit_log', count(*)::integer from public.audit_log
  union all select 'public.action_plan_decisions', count(*)::integer from public.action_plan_decisions
) counts;
`);
  return JSON.parse(output);
}

async function assertActualSnapshotPass(label) {
  const counts = await fetchActualCounts();
  assertExactSnapshotCounts(counts);
  console.log(`${label}: exact snapshot accepted.`);
}

async function assertActualSnapshotFails(label, expectedTableName) {
  const counts = await fetchActualCounts();
  const mismatches = evaluateSnapshotCounts(counts);
  if (!mismatches.some((mismatch) => mismatch.tableName === expectedTableName)) {
    throw new Error(`${label}: expected guard failure for ${expectedTableName}, got ${JSON.stringify(mismatches)}`);
  }
  console.log(`${label}: guard refused ${expectedTableName} with expected/observed counts only.`);
}

async function seedExactSnapshot() {
  const ownerUserId = await createAuthUser(ownerEmail);
  await executeSql(`
set search_path = '';

insert into public.tenants (id, name, status)
values ('${ids.tenant}', 'Atlas Local Reset Tenant', 'active');

insert into public.profiles (id, email, full_name)
values ('${ownerUserId}', '${ownerEmail}', 'Atlas Local Reset Owner');

insert into public.tenant_users (tenant_id, user_id, role_id, status)
select '${ids.tenant}', '${ownerUserId}', id, 'active'
from public.roles
where slug = 'owner';

insert into public.people (
  id, tenant_id, first_name, last_name, display_name, primary_email, city, status, priority
)
values (
  '${ids.person}', '${ids.tenant}', 'Alice', 'Simulation', 'Alice Simulation',
  'alice.simulation@atlas.local.test', 'Ville Test', 'qualified', 'medium'
);

insert into public.organizations (id, tenant_id, name, organization_type, status, city)
values ('${ids.organization}', '${ids.tenant}', 'Atlas Simulation Organization', 'agency', 'active', 'Ville Test');

insert into public.relationships (
  id, tenant_id, person_id, organization_id, relationship_type, pipeline_stage, status, owner_user_id
)
values (
  '${ids.relationship}', '${ids.tenant}', '${ids.person}', '${ids.organization}',
  'recruiting', 'qualification', 'active', '${ownerUserId}'
);

insert into public.interactions (
  id, tenant_id, person_id, organization_id, relationship_id, type_id, title, interaction_date, created_by
)
select interaction_id, '${ids.tenant}', '${ids.person}', '${ids.organization}', '${ids.relationship}',
       (select id from public.interaction_types where tenant_id is null and slug = 'call'),
       'Simulation interaction ' || row_number() over (), now(), '${ownerUserId}'
from unnest(array[
  '${ids.interactions[0]}'::uuid,
  '${ids.interactions[1]}'::uuid,
  '${ids.interactions[2]}'::uuid,
  '${ids.interactions[3]}'::uuid
]) as interaction_id;

insert into public.tasks (
  id, tenant_id, title, status, priority, assigned_to, created_by, person_id, organization_id, relationship_id, source_type, source_id
)
select task_id, '${ids.tenant}', 'Simulation task ' || row_number() over (), 'todo', 'normal',
       '${ownerUserId}', '${ownerUserId}', '${ids.person}', '${ids.organization}', '${ids.relationship}', 'manual', gen_random_uuid()
from unnest(array[
  '${ids.tasks[0]}'::uuid,
  '${ids.tasks[1]}'::uuid,
  '${ids.tasks[2]}'::uuid,
  '${ids.tasks[3]}'::uuid
]) as task_id;

insert into public.timeline_events (
  tenant_id, event_type, title, occurred_at, created_by, person_id, source_type, source_id, idempotency_key
)
values
  ('${ids.tenant}', 'person_created', 'Personne creee', now(), '${ownerUserId}', '${ids.person}', 'person', '${ids.person}', 'simulation:person');

insert into public.timeline_events (
  tenant_id, event_type, title, occurred_at, created_by, organization_id, source_type, source_id, idempotency_key
)
values
  ('${ids.tenant}', 'organization_created', 'Organisation creee', now(), '${ownerUserId}', '${ids.organization}', 'organization', '${ids.organization}', 'simulation:organization');

insert into public.timeline_events (
  tenant_id, event_type, title, occurred_at, created_by, person_id, organization_id, relationship_id, source_type, source_id, idempotency_key
)
values
  ('${ids.tenant}', 'relationship_created', 'Relation creee', now(), '${ownerUserId}', '${ids.person}', '${ids.organization}', '${ids.relationship}', 'relationship', '${ids.relationship}', 'simulation:relationship');

insert into public.timeline_events (
  tenant_id, event_type, title, occurred_at, created_by, person_id, organization_id, relationship_id, interaction_id, source_type, source_id, idempotency_key
)
select '${ids.tenant}', 'interaction_created', 'Echange cree', now(), '${ownerUserId}',
       '${ids.person}', '${ids.organization}', '${ids.relationship}', interaction_id, 'interaction', interaction_id,
       'simulation:interaction:' || interaction_id::text
from unnest(array[
  '${ids.interactions[0]}'::uuid,
  '${ids.interactions[1]}'::uuid,
  '${ids.interactions[2]}'::uuid,
  '${ids.interactions[3]}'::uuid
]) as interaction_id;

insert into public.timeline_events (
  tenant_id, event_type, title, occurred_at, created_by, person_id, organization_id, relationship_id, task_id, source_type, source_id, idempotency_key
)
select '${ids.tenant}', 'task_created', 'Tache creee', now(), '${ownerUserId}',
       '${ids.person}', '${ids.organization}', '${ids.relationship}', task_id, 'task', task_id,
       'simulation:task:' || task_id::text
from unnest(array[
  '${ids.tasks[0]}'::uuid,
  '${ids.tasks[1]}'::uuid
]) as task_id;

insert into public.audit_log (tenant_id, user_id, table_name, record_id, action, new_value)
select '${ids.tenant}', '${ownerUserId}', 'simulation_padding', gen_random_uuid(), 'insert', '{}'::jsonb
from generate_series(1, 17);
`);
  console.log("Created exact local pre-reset snapshot with fictitious data.");
  return ownerUserId;
}

async function runGuardFailureScenarios(ownerUserId) {
  const extraUserId = await createAuthUser(extraOwnerEmail);
  await assertActualSnapshotFails("auth.users = 2", "auth.users");
  await deleteAuthUser(extraUserId);

  const supabase = adminClient();
  const bucketName = "atlas-reset-simulation-blocked";
  const { error: createBucketError } = await supabase.storage.createBucket(bucketName, { public: false });
  if (createBucketError) throw new Error(`create storage bucket: ${createBucketError.message}`);
  await assertActualSnapshotFails("storage.buckets = 1", "storage.buckets");
  const { error: uploadError } = await supabase.storage.from(bucketName).upload("blocked.txt", Buffer.from("local simulation only"));
  if (uploadError) throw new Error(`upload storage object: ${uploadError.message}`);
  await assertActualSnapshotFails("storage.objects = 1", "storage.objects");
  await supabase.storage.from(bucketName).remove(["blocked.txt"]);
  await supabase.storage.deleteBucket(bucketName);

  await deleteAuthUser(ownerUserId);
  await assertActualSnapshotFails("auth.users = 0", "auth.users");
}

async function runLocalReset() {
  const cli = supabaseCliParts();
  await run(cli.command, [...cli.args, "db", "reset", "--no-seed", "--yes"], { stdio: "inherit" });
  console.log("Local Supabase reset completed with canonical migrations and no seed.");
}

async function verifyPostResetReadiness() {
  await executeSql(`
set search_path = '';
do $$
declare
  missing_version_count integer;
  missing_table_count integer;
  missing_rls_count integer;
begin
  select count(*)
  into missing_version_count
  from unnest(array['0001','0002','0003','0004','0005','0006','0007','0008','0009','0010']) as version_prefix
  where not exists (
    select 1 from supabase_migrations.schema_migrations sm
    where sm.version like version_prefix || '%'
  );
  if missing_version_count > 0 then
    raise exception 'Expected migration history 0001 through 0010 is incomplete.';
  end if;

  select count(*)
  into missing_table_count
  from unnest(array[
    'public.roles',
    'public.tenants',
    'public.profiles',
    'public.tenant_users',
    'public.people',
    'public.organizations',
    'public.relationships',
    'public.interaction_types',
    'public.interactions',
    'public.tasks',
    'public.timeline_events',
    'public.action_plan_decisions',
    'public.projects',
    'public.recruitment_pipeline_events'
  ]) as table_name
  where to_regclass(table_name) is null;
  if missing_table_count > 0 then
    raise exception 'Expected Atlas tables are missing after local reset.';
  end if;

  select count(*)
  into missing_rls_count
  from unnest(array[
    'tenants',
    'profiles',
    'tenant_users',
    'people',
    'organizations',
    'relationships',
    'interactions',
    'tasks',
    'timeline_events',
    'action_plan_decisions',
    'projects',
    'recruitment_pipeline_events'
  ]) as table_name
  where not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = table_name
      and c.relrowsecurity
  );
  if missing_rls_count > 0 then
    raise exception 'Expected RLS-enabled Atlas tables are missing RLS after local reset.';
  end if;

  if not has_table_privilege('authenticated', 'public.people', 'select') then
    raise exception 'authenticated role cannot select public.people.';
  end if;
  if not has_table_privilege('authenticated', 'public.projects', 'select') then
    raise exception 'authenticated role cannot select public.projects.';
  end if;
  if not has_function_privilege('authenticated', 'public.transition_recruitment_pipeline(uuid, uuid, text, text, timestamp with time zone, boolean, text, timestamp with time zone, timestamp with time zone, text, text, boolean, timestamp with time zone, boolean, jsonb)', 'execute') then
    raise exception 'authenticated role cannot execute transition_recruitment_pipeline.';
  end if;
end $$;
notify pgrst, 'reload schema';
`);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 5000));
  console.log("Post-reset schema, RLS, privileges, RPC and PostgREST reload verified.");
}

async function bootstrapFirstOwner() {
  const before = Number(await querySingleValue("select count(*)::text as result from auth.users;"));
  let matchingUserId = (await querySingleValue(`select id::text as result from auth.users where lower(email) = lower('${ownerEmail}') limit 1;`)).trim();
  if (!matchingUserId) {
    matchingUserId = await createAuthUser(ownerEmail);
  }
  const after = Number(await querySingleValue("select count(*)::text as result from auth.users;"));
  if (after > 2) {
    throw new Error("Refusing owner bootstrap: unexpected number of auth.users rows.");
  }

  await executeSql(`
set search_path = '';
do $$
declare
  bootstrap_user_id uuid := '${matchingUserId}';
  bootstrap_tenant_id uuid;
  owner_role_id uuid;
begin
  select id into owner_role_id from public.roles where slug = 'owner';
  if owner_role_id is null then
    raise exception 'Role owner not found after local reset.';
  end if;

  select id into bootstrap_tenant_id
  from public.tenants
  where name = 'Atlas Local Reset Tenant'
  order by created_at asc
  limit 1;

  if bootstrap_tenant_id is null then
    insert into public.tenants (name, status)
    values ('Atlas Local Reset Tenant', 'active')
    returning id into bootstrap_tenant_id;
  end if;

  insert into public.profiles (id, email, full_name)
  select id, email, coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name', email)
  from auth.users
  where id = bootstrap_user_id
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    updated_at = now();

  insert into public.tenant_users (tenant_id, user_id, role_id, status)
  values (bootstrap_tenant_id, bootstrap_user_id, owner_role_id, 'active')
  on conflict (tenant_id, user_id) do update set
    role_id = excluded.role_id,
    status = 'active',
    updated_at = now();
end $$;
`);
  console.log(`Local auth.users count around reset/bootstrap: before=${before} after=${after}.`);
  console.log("Local first owner bootstrap completed idempotently.");
}

async function verifyNoQaSeedData() {
  await executeSql(`
set search_path = '';
do $$
begin
  if (select count(*) from public.tenants) <> 1 then
    raise exception 'Expected exactly one tenant after local owner bootstrap.';
  end if;
  if (select count(*) from public.tenant_users) <> 1 then
    raise exception 'Expected exactly one tenant owner membership after local owner bootstrap.';
  end if;
  if exists (select 1 from public.tenants where name like 'Atlas QA Tenant %') then
    raise exception 'Unexpected CI QA tenant data found after local reset.';
  end if;
  if exists (select 1 from public.profiles where email like 'qa-%@atlas.local.test') then
    raise exception 'Unexpected CI QA user profile data found after local reset.';
  end if;
end $$;
`);
  console.log("Verified no accidental QA seed data after local reset.");
}

async function simulate() {
  assertLocalOnlyEnvironment();
  validateManualResetInputs({
    projectRef: LOCAL_PROJECT_REF,
    confirmation: EXPECTED_CONFIRMATION,
    applyReset: true,
    authorizedSha: "2f3ed0dd951b9698ca931b705daec1806477444a"
  });
  verifyMigrationSet();

  const ownerUserId = await seedExactSnapshot();
  await assertActualSnapshotPass("Initial local pre-reset guard");
  await runGuardFailureScenarios(ownerUserId);

  await runLocalReset();
  const secondOwnerUserId = await seedExactSnapshot();
  await assertActualSnapshotPass("Success-path local pre-reset guard");
  await deleteAuthUser(secondOwnerUserId);

  await runLocalReset();
  await verifyPostResetReadiness();
  await bootstrapFirstOwner();
  await verifyNoQaSeedData();
  console.log("Supabase test reset local simulation completed without contacting a remote Supabase project.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  simulate().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
