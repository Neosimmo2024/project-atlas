import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type TestUser = {
  email: string;
  password: string;
};

const requiredEnv = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "PEOPLE_TEST_TENANT_A_EMAIL",
  "PEOPLE_TEST_TENANT_A_PASSWORD",
  "PEOPLE_TEST_TENANT_B_EMAIL",
  "PEOPLE_TEST_TENANT_B_PASSWORD",
  "PEOPLE_TEST_NO_TENANT_EMAIL",
  "PEOPLE_TEST_NO_TENANT_PASSWORD"
] as const;

const hasIntegrationEnv = requiredEnv.every((key) => Boolean(process.env[key]));
const describeIntegration = hasIntegrationEnv ? describe : describe.skip;
const marker = `people-rls-${Date.now()}`;

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

describeIntegration("people RLS integration", () => {
  let tenantA: SupabaseClient;
  let tenantB: SupabaseClient;
  let noTenant: SupabaseClient;
  let tenantAId: string;
  let tenantBId: string;
  let personAId: string;
  let personBId: string;

  beforeAll(async () => {
    tenantA = await supabaseForUser({ email: process.env.PEOPLE_TEST_TENANT_A_EMAIL!, password: process.env.PEOPLE_TEST_TENANT_A_PASSWORD! });
    tenantB = await supabaseForUser({ email: process.env.PEOPLE_TEST_TENANT_B_EMAIL!, password: process.env.PEOPLE_TEST_TENANT_B_PASSWORD! });
    noTenant = await supabaseForUser({ email: process.env.PEOPLE_TEST_NO_TENANT_EMAIL!, password: process.env.PEOPLE_TEST_NO_TENANT_PASSWORD! });
    tenantAId = (await firstTenantId(tenantA))!;
    tenantBId = (await firstTenantId(tenantB))!;
    if (!tenantAId || !tenantBId || tenantAId === tenantBId) throw new Error("Integration users must belong to two distinct active tenants.");

    const { data: personA, error: errorA } = await tenantA.from("people").insert({
      tenant_id: tenantAId,
      display_name: `${marker} tenant A`,
      status: "to_qualify",
      priority: "medium"
    }).select("id").single();
    if (errorA) throw errorA;
    personAId = personA.id as string;

    const { data: personB, error: errorB } = await tenantB.from("people").insert({
      tenant_id: tenantBId,
      display_name: `${marker} tenant B`,
      status: "to_qualify",
      priority: "medium"
    }).select("id").single();
    if (errorB) throw errorB;
    personBId = personB.id as string;
  });

  afterAll(async () => {
    await tenantA?.from("people").delete().eq("display_name", `${marker} tenant A`);
    await tenantB?.from("people").delete().eq("display_name", `${marker} tenant B`);
  });

  it("tenant A reads tenant A people", async () => {
    const { data, error } = await tenantA.from("people").select("id").eq("id", personAId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("tenant A cannot read tenant B people", async () => {
    const { data, error } = await tenantA.from("people").select("id").eq("id", personBId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("tenant A cannot update or delete tenant B people", async () => {
    const update = await tenantA.from("people").update({ display_name: `${marker} forbidden update` }).eq("id", personBId).select("id");
    expect(update.error).toBeNull();
    expect(update.data).toHaveLength(0);

    const deletion = await tenantA.from("people").delete().eq("id", personBId).select("id");
    expect(deletion.error).toBeNull();
    expect(deletion.data).toHaveLength(0);
  });

  it("user without active tenant cannot access people", async () => {
    const { data, error } = await noTenant.from("people").select("id").limit(1);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("browser supplied tenant_id is ignored by RLS when it targets another tenant", async () => {
    const { data, error } = await tenantA.from("people").insert({
      tenant_id: tenantBId,
      display_name: `${marker} malicious tenant id`,
      status: "to_qualify",
      priority: "medium"
    }).select("id");
    expect(data ?? []).toHaveLength(0);
    expect(error).not.toBeNull();
  });

  it("creation succeeds only for the tenant of the active session", async () => {
    const { data, error } = await tenantA.from("people").insert({
      tenant_id: tenantAId,
      display_name: `${marker} session tenant create`,
      status: "to_qualify",
      priority: "medium"
    }).select("tenant_id").single();
    expect(error).toBeNull();
    expect(data?.tenant_id).toBe(tenantAId);
    await tenantA.from("people").delete().eq("display_name", `${marker} session tenant create`);
  });
});
