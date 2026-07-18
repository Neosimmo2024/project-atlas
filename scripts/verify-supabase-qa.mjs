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
  const { error } = await supabase.from("projects").select("id", { count: "exact", head: true });
  if (error) throw new Error(`PostgREST cannot see public.projects: ${JSON.stringify(error)}`);
}

async function assertInformationSchema() {
  const requiredTables = ["projects", "people", "organizations", "relationships", "tasks", "interactions", "timeline_events", "action_plan_decisions"];
  for (const table of requiredTables) {
    const { data, error } = await supabase.from(table).select("id", { head: true, count: "exact" });
    if (error) throw new Error(`Expected table ${table} to be queryable: ${JSON.stringify(error)}`);
    void data;
  }

  for (const table of ["tasks", "interactions", "timeline_events"]) {
    const { error } = await supabase.from(table).select("project_id", { head: true, count: "exact" });
    if (error) throw new Error(`Expected ${table}.project_id to be queryable: ${JSON.stringify(error)}`);
  }
}

verify().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
