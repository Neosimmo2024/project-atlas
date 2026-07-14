import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type TestUser = {
  email: string;
  password: string;
};

const requiredEnv = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "ORGANIZATIONS_TEST_TENANT_A_EMAIL",
  "ORGANIZATIONS_TEST_TENANT_A_PASSWORD",
  "ORGANIZATIONS_TEST_TENANT_B_EMAIL",
  "ORGANIZATIONS_TEST_TENANT_B_PASSWORD",
  "ORGANIZATIONS_TEST_NO_TENANT_EMAIL",
  "ORGANIZATIONS_TEST_NO_TENANT_PASSWORD"
] as const;

const hasIntegrationEnv = requiredEnv.every((key) => Boolean(process.env[key]));
const describeIntegration = hasIntegrationEnv ? describe : describe.skip;
const marker = `organizations-rls-${Date.now()}`;

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

describeIntegration("organizations RLS integration", () => {
  let tenantA: SupabaseClient;
  let tenantB: SupabaseClient;
  let noTenant: SupabaseClient;
  let tenantAId: string;
  let tenantBId: string;
  let organizationAId: string;
  let organizationBId: string;

  beforeAll(async () => {
    tenantA = await supabaseForUser({ email: process.env.ORGANIZATIONS_TEST_TENANT_A_EMAIL!, password: process.env.ORGANIZATIONS_TEST_TENANT_A_PASSWORD! });
    tenantB = await supabaseForUser({ email: process.env.ORGANIZATIONS_TEST_TENANT_B_EMAIL!, password: process.env.ORGANIZATIONS_TEST_TENANT_B_PASSWORD! });
    noTenant = await supabaseForUser({ email: process.env.ORGANIZATIONS_TEST_NO_TENANT_EMAIL!, password: process.env.ORGANIZATIONS_TEST_NO_TENANT_PASSWORD! });
    tenantAId = (await firstTenantId(tenantA))!;
    tenantBId = (await firstTenantId(tenantB))!;
    if (!tenantAId || !tenantBId || tenantAId === tenantBId) throw new Error("Integration users must belong to two distinct active tenants.");

    const { data: organizationA, error: errorA } = await tenantA.from("organizations").insert({
      tenant_id: tenantAId,
      name: `${marker} tenant A`,
      organization_type: "agency",
      status: "active"
    }).select("id").single();
    if (errorA) throw errorA;
    organizationAId = organizationA.id as string;

    const { data: organizationB, error: errorB } = await tenantB.from("organizations").insert({
      tenant_id: tenantBId,
      name: `${marker} tenant B`,
      organization_type: "agency",
      status: "active"
    }).select("id").single();
    if (errorB) throw errorB;
    organizationBId = organizationB.id as string;
  });

  afterAll(async () => {
    await tenantA?.from("organizations").delete().like("name", `${marker}%`);
    await tenantB?.from("organizations").delete().like("name", `${marker}%`);
  });

  it("tenant A reads tenant A organizations", async () => {
    const { data, error } = await tenantA.from("organizations").select("id").eq("id", organizationAId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("tenant A cannot read tenant B organizations", async () => {
    const { data, error } = await tenantA.from("organizations").select("id").eq("id", organizationBId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("tenant A cannot update or delete tenant B organizations", async () => {
    const update = await tenantA.from("organizations").update({ name: `${marker} forbidden update` }).eq("id", organizationBId).select("id");
    expect(update.error).toBeNull();
    expect(update.data).toHaveLength(0);

    const deletion = await tenantA.from("organizations").delete().eq("id", organizationBId).select("id");
    expect(deletion.error).toBeNull();
    expect(deletion.data).toHaveLength(0);
  });

  it("user without active tenant cannot access organizations", async () => {
    const { data, error } = await noTenant.from("organizations").select("id").limit(1);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("browser supplied tenant_id is ignored by RLS when it targets another tenant", async () => {
    const { data, error } = await tenantA.from("organizations").insert({
      tenant_id: tenantBId,
      name: `${marker} malicious tenant id`,
      organization_type: "agency",
      status: "active"
    }).select("id");
    expect(data ?? []).toHaveLength(0);
    expect(error).not.toBeNull();
  });

  it("creation succeeds only for the tenant of the active session", async () => {
    const { data, error } = await tenantA.from("organizations").insert({
      tenant_id: tenantAId,
      name: `${marker} session tenant create`,
      organization_type: "agency",
      status: "active"
    }).select("tenant_id").single();
    expect(error).toBeNull();
    expect(data?.tenant_id).toBe(tenantAId);
    await tenantA.from("organizations").delete().eq("name", `${marker} session tenant create`);
  });
});
