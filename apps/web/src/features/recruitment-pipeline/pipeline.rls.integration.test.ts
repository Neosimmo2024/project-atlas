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
const marker = `pipeline-rls-${Date.now()}`;

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

async function createRelationship(client: SupabaseClient, tenantId: string, suffix: string) {
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

  const { data: relationship, error: relationshipError } = await client.from("relationships").insert({
    tenant_id: tenantId,
    person_id: person.id,
    organization_id: organization.id,
    relationship_type: "recruiting",
    pipeline_stage: "qualification",
    status: "active"
  }).select("id").single();
  if (relationshipError) throw relationshipError;

  return { relationshipId: relationship.id as string };
}

describeIntegration("pipeline RLS integration", () => {
  let tenantA: SupabaseClient;
  let tenantB: SupabaseClient;
  let noTenant: SupabaseClient;
  let tenantAId: string;
  let tenantBId: string;
  let relationshipAId: string;
  let relationshipBId: string;

  beforeAll(async () => {
    tenantA = await supabaseForUser({ email: process.env.RELATIONSHIPS_TEST_TENANT_A_EMAIL!, password: process.env.RELATIONSHIPS_TEST_TENANT_A_PASSWORD! });
    tenantB = await supabaseForUser({ email: process.env.RELATIONSHIPS_TEST_TENANT_B_EMAIL!, password: process.env.RELATIONSHIPS_TEST_TENANT_B_PASSWORD! });
    noTenant = await supabaseForUser({ email: process.env.RELATIONSHIPS_TEST_NO_TENANT_EMAIL!, password: process.env.RELATIONSHIPS_TEST_NO_TENANT_PASSWORD! });
    tenantAId = (await firstTenantId(tenantA))!;
    tenantBId = (await firstTenantId(tenantB))!;
    if (!tenantAId || !tenantBId || tenantAId === tenantBId) throw new Error("Pipeline RLS users must belong to two distinct tenants.");

    relationshipAId = (await createRelationship(tenantA, tenantAId, "A")).relationshipId;
    relationshipBId = (await createRelationship(tenantB, tenantBId, "B")).relationshipId;
  });

  afterAll(async () => {
    await tenantA?.from("relationships").delete().eq("id", relationshipAId);
    await tenantB?.from("relationships").delete().eq("id", relationshipBId);
    await tenantA?.from("people").delete().like("display_name", `${marker}%`);
    await tenantB?.from("people").delete().like("display_name", `${marker}%`);
    await tenantA?.from("organizations").delete().like("name", `${marker}%`);
    await tenantB?.from("organizations").delete().like("name", `${marker}%`);
  });

  it("tenant A reads only tenant A pipeline relationships", async () => {
    const own = await tenantA.from("relationships").select("id, pipeline_stage").eq("id", relationshipAId);
    const other = await tenantA.from("relationships").select("id, pipeline_stage").eq("id", relationshipBId);

    expect(own.error).toBeNull();
    expect(own.data).toHaveLength(1);
    expect(other.error).toBeNull();
    expect(other.data).toHaveLength(0);
  });

  it("tenant A cannot transition a tenant B relationship", async () => {
    const transition = await tenantA.rpc("transition_recruitment_pipeline", {
      p_relationship_id: relationshipBId,
      p_tenant_id: tenantBId,
      p_to_stage: "conversation",
      p_expected_stage: null,
      p_expected_updated_at: null,
      p_confirmed: false,
      p_reason: "Forbidden from tenant A",
      p_signature_at: null,
      p_start_at: null,
      p_rejection_reason: null,
      p_rejection_comment: null,
      p_rejection_recontactable: null,
      p_rejection_follow_up_at: null,
      p_do_not_contact: null,
      p_metadata: {}
    });

    expect(transition.error).not.toBeNull();
  });

  it("user without active tenant cannot read pipeline relationships", async () => {
    const read = await noTenant.from("relationships").select("id").limit(1);

    expect(read.error).toBeNull();
    expect(read.data).toHaveLength(0);
  });
});
