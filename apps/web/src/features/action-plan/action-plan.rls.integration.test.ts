import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type TestUser = {
  email: string;
  password: string;
};

const requiredEnv = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "ACTION_PLAN_TEST_TENANT_A_EMAIL",
  "ACTION_PLAN_TEST_TENANT_A_PASSWORD",
  "ACTION_PLAN_TEST_TENANT_B_EMAIL",
  "ACTION_PLAN_TEST_TENANT_B_PASSWORD",
  "ACTION_PLAN_TEST_NO_TENANT_EMAIL",
  "ACTION_PLAN_TEST_NO_TENANT_PASSWORD"
] as const;

const hasIntegrationEnv = requiredEnv.every((key) => Boolean(process.env[key]));
const describeIntegration = hasIntegrationEnv ? describe : describe.skip;
const marker = `action-plan-rls-${Date.now()}`;

function supabaseForUser(user: TestUser) {
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  return client.auth.signInWithPassword(user).then(({ data, error }) => {
    if (error) throw error;
    return { client, userId: data.user.id };
  });
}

async function firstTenantId(client: SupabaseClient) {
  const { data, error } = await client.from("tenant_users").select("tenant_id").eq("status", "active").limit(1).maybeSingle();
  if (error) throw error;
  return data?.tenant_id as string | undefined;
}

describeIntegration("action plan decisions RLS integration", () => {
  let tenantA: SupabaseClient;
  let tenantB: SupabaseClient;
  let noTenant: SupabaseClient;
  let tenantAUserId: string;
  let tenantBUserId: string;
  let tenantAId: string;
  let tenantBId: string;
  let organizationAId: string;
  let organizationBId: string;
  let decisionAId: string;
  let decisionBId: string;

  beforeAll(async () => {
    const sessionA = await supabaseForUser({ email: process.env.ACTION_PLAN_TEST_TENANT_A_EMAIL!, password: process.env.ACTION_PLAN_TEST_TENANT_A_PASSWORD! });
    const sessionB = await supabaseForUser({ email: process.env.ACTION_PLAN_TEST_TENANT_B_EMAIL!, password: process.env.ACTION_PLAN_TEST_TENANT_B_PASSWORD! });
    const sessionNoTenant = await supabaseForUser({ email: process.env.ACTION_PLAN_TEST_NO_TENANT_EMAIL!, password: process.env.ACTION_PLAN_TEST_NO_TENANT_PASSWORD! });
    tenantA = sessionA.client;
    tenantB = sessionB.client;
    noTenant = sessionNoTenant.client;
    tenantAUserId = sessionA.userId;
    tenantBUserId = sessionB.userId;
    tenantAId = (await firstTenantId(tenantA))!;
    tenantBId = (await firstTenantId(tenantB))!;
    if (!tenantAId || !tenantBId || tenantAId === tenantBId) throw new Error("Integration users must be provisioned in two distinct tenants.");

    const { data: organizationA, error: organizationAError } = await tenantA.from("organizations").insert({ tenant_id: tenantAId, name: `${marker} A`, status: "active" }).select("id").single();
    if (organizationAError) throw organizationAError;
    organizationAId = organizationA.id as string;

    const { data: organizationB, error: organizationBError } = await tenantB.from("organizations").insert({ tenant_id: tenantBId, name: `${marker} B`, status: "active" }).select("id").single();
    if (organizationBError) throw organizationBError;
    organizationBId = organizationB.id as string;

    const { data: decisionA, error: decisionAError } = await tenantA.from("action_plan_decisions").insert({
      tenant_id: tenantAId,
      organization_id: organizationAId,
      user_id: tenantAUserId,
      recommendation_key: `${marker}:a`,
      decision_type: "ignored"
    }).select("id").single();
    if (decisionAError) throw decisionAError;
    decisionAId = decisionA.id as string;

    const { data: decisionB, error: decisionBError } = await tenantB.from("action_plan_decisions").insert({
      tenant_id: tenantBId,
      organization_id: organizationBId,
      user_id: tenantBUserId,
      recommendation_key: `${marker}:b`,
      decision_type: "ignored"
    }).select("id").single();
    if (decisionBError) throw decisionBError;
    decisionBId = decisionB.id as string;
  });

  afterAll(async () => {
    await tenantA?.from("action_plan_decisions").delete().like("recommendation_key", `${marker}%`);
    await tenantB?.from("action_plan_decisions").delete().like("recommendation_key", `${marker}%`);
    await tenantA?.from("organizations").delete().like("name", `${marker}%`);
    await tenantB?.from("organizations").delete().like("name", `${marker}%`);
  });

  it("tenant A reads tenant A decisions", async () => {
    const { data, error } = await tenantA.from("action_plan_decisions").select("id").eq("id", decisionAId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("tenant A cannot read tenant B decisions", async () => {
    const { data, error } = await tenantA.from("action_plan_decisions").select("id").eq("id", decisionBId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("tenant A cannot write a decision for tenant B", async () => {
    const { data, error } = await tenantA.from("action_plan_decisions").insert({
      tenant_id: tenantBId,
      organization_id: organizationBId,
      user_id: tenantAUserId,
      recommendation_key: `${marker}:malicious`,
      decision_type: "ignored"
    }).select("id");

    expect(data ?? []).toHaveLength(0);
    expect(error).not.toBeNull();
  });

  it("user without tenant cannot access decisions", async () => {
    const { data, error } = await noTenant.from("action_plan_decisions").select("id").limit(1);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });
});
