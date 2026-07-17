import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type TestUser = {
  email: string;
  password: string;
};

const requiredEnv = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "TASKS_TEST_TENANT_A_EMAIL",
  "TASKS_TEST_TENANT_A_PASSWORD",
  "TASKS_TEST_TENANT_B_EMAIL",
  "TASKS_TEST_TENANT_B_PASSWORD",
  "TASKS_TEST_NO_TENANT_EMAIL",
  "TASKS_TEST_NO_TENANT_PASSWORD"
] as const;

const hasIntegrationEnv = requiredEnv.every((key) => Boolean(process.env[key]));
const describeIntegration = hasIntegrationEnv ? describe : describe.skip;
const marker = `tasks-rls-${Date.now()}`;

function supabaseForUser(user: TestUser) {
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  return client.auth.signInWithPassword(user).then(({ error }) => {
    if (error) throw error;
    return client;
  });
}

async function firstTenantId(client: SupabaseClient) {
  const { data, error } = await client.from("tenant_users").select("tenant_id").eq("status", "active").limit(1).maybeSingle();
  if (error) throw error;
  return data?.tenant_id as string | undefined;
}

describeIntegration("tasks RLS integration", () => {
  let tenantA: SupabaseClient;
  let tenantB: SupabaseClient;
  let noTenant: SupabaseClient;
  let tenantAId: string;
  let tenantBId: string;
  let taskAId: string;
  let taskBId: string;

  beforeAll(async () => {
    tenantA = await supabaseForUser({ email: process.env.TASKS_TEST_TENANT_A_EMAIL!, password: process.env.TASKS_TEST_TENANT_A_PASSWORD! });
    tenantB = await supabaseForUser({ email: process.env.TASKS_TEST_TENANT_B_EMAIL!, password: process.env.TASKS_TEST_TENANT_B_PASSWORD! });
    noTenant = await supabaseForUser({ email: process.env.TASKS_TEST_NO_TENANT_EMAIL!, password: process.env.TASKS_TEST_NO_TENANT_PASSWORD! });
    tenantAId = (await firstTenantId(tenantA))!;
    tenantBId = (await firstTenantId(tenantB))!;
    if (!tenantAId || !tenantBId || tenantAId === tenantBId) throw new Error("Integration users must be provisioned in two distinct tenants.");

    const { data: taskA, error: errorA } = await tenantA.from("tasks").insert({
      tenant_id: tenantAId,
      title: `${marker} tenant A`,
      status: "todo",
      priority: "normal",
      metadata: { test: marker }
    }).select("id").single();
    if (errorA) throw errorA;
    taskAId = taskA.id as string;

    const { data: taskB, error: errorB } = await tenantB.from("tasks").insert({
      tenant_id: tenantBId,
      title: `${marker} tenant B`,
      status: "todo",
      priority: "normal",
      metadata: { test: marker }
    }).select("id").single();
    if (errorB) throw errorB;
    taskBId = taskB.id as string;
  });

  afterAll(async () => {
    await tenantA?.from("tasks").delete().like("title", `${marker}%`);
    await tenantB?.from("tasks").delete().like("title", `${marker}%`);
  });

  it("tenant A reads tenant A tasks", async () => {
    const { data, error } = await tenantA.from("tasks").select("id").eq("id", taskAId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("tenant A cannot read tenant B tasks", async () => {
    const { data, error } = await tenantA.from("tasks").select("id").eq("id", taskBId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("tenant A cannot update or delete tenant B tasks", async () => {
    const update = await tenantA.from("tasks").update({ title: `${marker} forbidden update` }).eq("id", taskBId).select("id");
    expect(update.error).toBeNull();
    expect(update.data).toHaveLength(0);

    const deletion = await tenantA.from("tasks").delete().eq("id", taskBId).select("id");
    expect(deletion.error).toBeNull();
    expect(deletion.data).toHaveLength(0);
  });

  it("user without active tenant cannot access tasks", async () => {
    const { data, error } = await noTenant.from("tasks").select("id").limit(1);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("browser supplied tenant_id is rejected by RLS when it targets another tenant", async () => {
    const { data, error } = await tenantA.from("tasks").insert({
      tenant_id: tenantBId,
      title: `${marker} malicious tenant`,
      status: "todo",
      priority: "normal"
    }).select("id");
    expect(data ?? []).toHaveLength(0);
    expect(error).not.toBeNull();
  });
});
