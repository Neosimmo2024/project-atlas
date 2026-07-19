import { createClient } from "@supabase/supabase-js";

const url = process.env.QA_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.QA_SUPABASE_SERVICE_ROLE_KEY;

if (!url) throw new Error("Missing QA_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL");
if (!serviceRoleKey) throw new Error("Missing QA_SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(url, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

async function verify() {
  await assertPostgrestProjectsVisible();
  await assertInformationSchema();
  console.log("Supabase QA schema verification passed.");
}

async function assertPostgrestProjectsVisible() {
  await assertQueryEventually("projects", "id", "PostgREST cannot see public.projects");
}

async function assertInformationSchema() {
  const requiredTables = ["projects", "people", "organizations", "relationships", "tasks", "interactions", "timeline_events", "action_plan_decisions"];
  for (const table of requiredTables) {
    await assertQueryEventually(table, "id", `Expected table ${table} to be queryable`);
  }

  for (const table of ["tasks", "interactions", "timeline_events"]) {
    await assertQueryEventually(table, "project_id", `Expected ${table}.project_id to be queryable`);
  }
}

async function assertQueryEventually(table, columns, message) {
  let lastError = null;

  for (let attempt = 1; attempt <= 12; attempt += 1) {
    const { error } = await supabase.from(table).select(columns).limit(1);
    if (!error) return;

    lastError = error;
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }

  throw new Error(`${message}: ${JSON.stringify(lastError)}`);
}

verify().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
