import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type TestUser = {
  email: string;
  password: string;
};

const requiredEnv = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "RELATIONSHIPS_TEST_TENANT_A_EMAIL",
  "RELATIONSHIPS_TEST_TENANT_A_PASSWORD",
  "RELATIONSHIPS_TEST_TENANT_B_EMAIL",
  "RELATIONSHIPS_TEST_TENANT_B_PASSWORD",
  "RELATIONSHIPS_TEST_NO_TENANT_EMAIL",
  "RELATIONSHIPS_TEST_NO_TENANT_PASSWORD"
] as const;

const hasIntegrationEnv = requiredEnv.every((key) => Boolean(process.env[key]));
const describeIntegration = hasIntegrationEnv ? describe : describe.skip;
const marker = `relationships-rls-${Date.now()}`;

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

async function createPersonAndOrganization(client: SupabaseClient, tenantId: string, suffix: string) {
  const { data: person, error: personError } = await client.from("people").insert({
    tenant_id: tenantId,
    display_name: `${marker} person ${suffix}`,
    status: "to_qualify",
    priority: "medium"
  }).select("id").single();
  if (personError) throw personError;

  const { data: organization, error: organizationError } = await client.from("organizations").insert({
    tenant_id: tenantId,
    name: `${marker} organization ${suffix}`,
    organization_type: "agency",
    status: "active"
  }).select("id").single();
  if (organizationError) throw organizationError;

  return { personId: person.id as string, organizationId: organization.id as string };
}

describeIntegration("relationships RLS integration", () => {
  let tenantA: SupabaseClient;
  let tenantB: SupabaseClient;
  let noTenant: SupabaseClient;
  let tenantAId: string;
  let tenantBId: string;
  let relationshipAId: string;
  let relationshipBId: string;
  let personAId: string;
  let organizationAId: string;

  beforeAll(async () => {
    tenantA = await supabaseForUser({ email: process.env.RELATIONSHIPS_TEST_TENANT_A_EMAIL!, password: process.env.RELATIONSHIPS_TEST_TENANT_A_PASSWORD! });
    tenantB = await supabaseForUser({ email: process.env.RELATIONSHIPS_TEST_TENANT_B_EMAIL!, password: process.env.RELATIONSHIPS_TEST_TENANT_B_PASSWORD! });
    noTenant = await supabaseForUser({ email: process.env.RELATIONSHIPS_TEST_NO_TENANT_EMAIL!, password: process.env.RELATIONSHIPS_TEST_NO_TENANT_PASSWORD! });
    tenantAId = (await firstTenantId(tenantA))!;
    tenantBId = (await firstTenantId(tenantB))!;
    if (!tenantAId || !tenantBId || tenantAId === tenantBId) throw new Error("Integration users must belong to two distinct active tenants.");

    const refsA = await createPersonAndOrganization(tenantA, tenantAId, "A");
    const refsB = await createPersonAndOrganization(tenantB, tenantBId, "B");
    personAId = refsA.personId;
    organizationAId = refsA.organizationId;

    const { data: relationshipA, error: errorA } = await tenantA.from("relationships").insert({
      tenant_id: tenantAId,
      person_id: refsA.personId,
      organization_id: refsA.organizationId,
      relationship_type: "recruiting",
      pipeline_stage: "detection",
      status: "active"
    }).select("id").single();
    if (errorA) throw errorA;
    relationshipAId = relationshipA.id as string;

    const { data: relationshipB, error: errorB } = await tenantB.from("relationships").insert({
      tenant_id: tenantBId,
      person_id: refsB.personId,
      organization_id: refsB.organizationId,
      relationship_type: "recruiting",
      pipeline_stage: "detection",
      status: "active"
    }).select("id").single();
    if (errorB) throw errorB;
    relationshipBId = relationshipB.id as string;
  });

  afterAll(async () => {
    await tenantA?.from("relationships").delete().eq("id", relationshipAId);
    await tenantB?.from("relationships").delete().eq("id", relationshipBId);
    await tenantA?.from("people").delete().like("display_name", `${marker}%`);
    await tenantB?.from("people").delete().like("display_name", `${marker}%`);
    await tenantA?.from("organizations").delete().like("name", `${marker}%`);
    await tenantB?.from("organizations").delete().like("name", `${marker}%`);
  });

  it("tenant A reads tenant A relationships", async () => {
    const { data, error } = await tenantA.from("relationships").select("id").eq("id", relationshipAId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("tenant A cannot read tenant B relationships", async () => {
    const { data, error } = await tenantA.from("relationships").select("id").eq("id", relationshipBId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("tenant A cannot update or delete tenant B relationships", async () => {
    const update = await tenantA.from("relationships").update({ notes: `${marker} forbidden update` }).eq("id", relationshipBId).select("id");
    expect(update.error).toBeNull();
    expect(update.data).toHaveLength(0);

    const deletion = await tenantA.from("relationships").delete().eq("id", relationshipBId).select("id");
    expect(deletion.error).toBeNull();
    expect(deletion.data).toHaveLength(0);
  });

  it("user without active tenant cannot access relationships", async () => {
    const { data, error } = await noTenant.from("relationships").select("id").limit(1);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("browser supplied tenant_id is rejected by RLS when it targets another tenant", async () => {
    const { data, error } = await tenantA.from("relationships").insert({
      tenant_id: tenantBId,
      person_id: personAId,
      organization_id: organizationAId,
      relationship_type: "recruiting",
      pipeline_stage: "detection",
      status: "active"
    }).select("id");
    expect(data ?? []).toHaveLength(0);
    expect(error).not.toBeNull();
  });
});
