import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

type TestUser = {
  email: string;
  password: string;
};

const requiredEnv = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "PROJECTS_TEST_TENANT_A_EMAIL",
  "PROJECTS_TEST_TENANT_A_PASSWORD",
  "PROJECTS_TEST_TENANT_B_EMAIL",
  "PROJECTS_TEST_TENANT_B_PASSWORD"
] as const;

const hasIntegrationEnv = requiredEnv.every((key) => Boolean(process.env[key]));
const describeIntegration = hasIntegrationEnv ? describe : describe.skip;
const marker = `csv-import-rls-${Date.now()}`;

function supabaseForUser(user: TestUser) {
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  return client.auth.signInWithPassword(user).then(({ error }) => {
    if (error) throw error;
    return client;
  });
}

async function firstTenantUser(client: SupabaseClient) {
  const { data, error } = await client.from("tenant_users").select("tenant_id, user_id").eq("status", "active").limit(1).maybeSingle();
  if (error) throw error;
  return data as { tenant_id: string; user_id: string } | null;
}

describeIntegration("csv import execution RLS integration", () => {
  let tenantA: SupabaseClient;
  let tenantB: SupabaseClient;
  let tenantAContext: { tenant_id: string; user_id: string };
  let tenantBContext: { tenant_id: string; user_id: string };

  beforeAll(async () => {
    tenantA = await supabaseForUser({ email: process.env.PROJECTS_TEST_TENANT_A_EMAIL!, password: process.env.PROJECTS_TEST_TENANT_A_PASSWORD! });
    tenantB = await supabaseForUser({ email: process.env.PROJECTS_TEST_TENANT_B_EMAIL!, password: process.env.PROJECTS_TEST_TENANT_B_PASSWORD! });
    tenantAContext = (await firstTenantUser(tenantA))!;
    tenantBContext = (await firstTenantUser(tenantB))!;
    if (!tenantAContext || !tenantBContext || tenantAContext.tenant_id === tenantBContext.tenant_id) throw new Error("Integration users must be provisioned in two distinct tenants.");
  });

  it("prevents direct inserts into import history", async () => {
    const result = await tenantA.from("csv_import_runs").insert({
      tenant_id: tenantAContext.tenant_id,
      requested_by: tenantAContext.user_id,
      idempotency_key: `${marker}-direct`,
      analysis_fingerprint: "[]",
      total_rows: 0
    }).select("id");

    expect(result.error).not.toBeNull();
  });

  it("executes imports only for the authenticated tenant and hides them from other tenants", async () => {
    const execution = await tenantA.rpc("execute_csv_import", {
      p_tenant_id: tenantAContext.tenant_id,
      p_idempotency_key: `${marker}-success`,
      p_source_name: "contacts.csv",
      p_analysis_fingerprint: "[]",
      p_actor_user_id: tenantAContext.user_id,
      p_rows: [{
        lineNumber: 2,
        decision: "create_new",
        classification: "new_contact",
        normalizedValues: {
          first_name: "Import",
          last_name: "Test",
          email: `${marker}@example.test`
        },
        targetPersonId: null,
        targetOrganizationId: null
      }]
    });

    expect(execution.error).toBeNull();

    const visibleToA = await tenantA.from("csv_import_runs").select("id").eq("idempotency_key", `${marker}-success`);
    expect(visibleToA.error).toBeNull();
    expect(visibleToA.data).toHaveLength(1);

    const visibleToB = await tenantB.from("csv_import_runs").select("id").eq("idempotency_key", `${marker}-success`);
    expect(visibleToB.error).toBeNull();
    expect(visibleToB.data).toHaveLength(0);
  });

  it("rejects attempts to execute against another tenant", async () => {
    const execution = await tenantA.rpc("execute_csv_import", {
      p_tenant_id: tenantBContext.tenant_id,
      p_idempotency_key: `${marker}-cross-tenant`,
      p_source_name: "contacts.csv",
      p_analysis_fingerprint: "[]",
      p_actor_user_id: tenantAContext.user_id,
      p_rows: []
    });

    expect(execution.error).not.toBeNull();
  });

  it("rejects direct link_existing RPC calls without an accessible target", async () => {
    const execution = await tenantA.rpc("execute_csv_import", {
      p_tenant_id: tenantAContext.tenant_id,
      p_idempotency_key: `${marker}-missing-target`,
      p_source_name: "contacts.csv",
      p_analysis_fingerprint: "[]",
      p_actor_user_id: tenantAContext.user_id,
      p_rows: [{
        lineNumber: 2,
        decision: "link_existing",
        classification: "existing_contact_enrichment",
        normalizedValues: {},
        targetPersonId: null,
        targetOrganizationId: null
      }]
    });

    expect(execution.error).not.toBeNull();
  });

  it("rejects reusing an idempotency key with a different payload fingerprint", async () => {
    const first = await tenantA.rpc("execute_csv_import", {
      p_tenant_id: tenantAContext.tenant_id,
      p_idempotency_key: `${marker}-changed-payload`,
      p_source_name: "contacts.csv",
      p_analysis_fingerprint: "fingerprint-a",
      p_actor_user_id: tenantAContext.user_id,
      p_rows: []
    });
    expect(first.error).toBeNull();

    const changed = await tenantA.rpc("execute_csv_import", {
      p_tenant_id: tenantAContext.tenant_id,
      p_idempotency_key: `${marker}-changed-payload`,
      p_source_name: "contacts.csv",
      p_analysis_fingerprint: "fingerprint-b",
      p_actor_user_id: tenantAContext.user_id,
      p_rows: []
    });

    expect(changed.error).not.toBeNull();
  });

  it("keeps cancellation history tenant scoped and blocks reader/direct table writes", async () => {
    const execution = await tenantA.rpc("execute_csv_import", {
      p_tenant_id: tenantAContext.tenant_id,
      p_idempotency_key: `${marker}-cancel-history`,
      p_source_name: "contacts.csv",
      p_analysis_fingerprint: "cancel-history",
      p_actor_user_id: tenantAContext.user_id,
      p_rows: []
    });
    expect(execution.error).toBeNull();

    const importId = (execution.data as { id?: string } | null)?.id;
    expect(importId).toBeTruthy();

    const analysis = await tenantA.rpc("analyze_csv_import_cancellation", {
      p_tenant_id: tenantAContext.tenant_id,
      p_import_run_id: importId,
      p_actor_user_id: tenantAContext.user_id
    });
    expect(analysis.error).toBeNull();

    const cancellation = await tenantA.rpc("cancel_csv_import", {
      p_tenant_id: tenantAContext.tenant_id,
      p_import_run_id: importId,
      p_idempotency_key: `${marker}-cancel-history-key`,
      p_actor_user_id: tenantAContext.user_id,
      p_confirm: true
    });
    expect(cancellation.error).toBeNull();

    const visibleToA = await tenantA.from("csv_import_cancellations").select("id").eq("import_run_id", importId);
    expect(visibleToA.error).toBeNull();
    expect(visibleToA.data).toHaveLength(1);

    const visibleToB = await tenantB.from("csv_import_cancellations").select("id").eq("import_run_id", importId);
    expect(visibleToB.error).toBeNull();
    expect(visibleToB.data).toHaveLength(0);

    const directInsert = await tenantA.from("csv_import_cancellations").insert({
      tenant_id: tenantAContext.tenant_id,
      import_run_id: importId,
      requested_by: tenantAContext.user_id,
      idempotency_key: `${marker}-direct-cancel`
    }).select("id");
    expect(directInsert.error).not.toBeNull();
  });
});
