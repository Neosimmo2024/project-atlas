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
  "PEOPLE_TEST_TENANT_B_PASSWORD"
] as const;

const hasIntegrationEnv = requiredEnv.every((key) => Boolean(process.env[key]));
const describeIntegration = hasIntegrationEnv ? describe : describe.skip;
const marker = `global-search-rls-${Date.now()}`;

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

async function createSearchableFixture(client: SupabaseClient, tenantId: string, suffix: string) {
  const { data: userData } = await client.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("Missing authenticated user");

  const { data: interactionType, error: interactionTypeError } = await client
    .from("interaction_types")
    .select("id")
    .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
    .limit(1)
    .single();
  if (interactionTypeError) throw interactionTypeError;

  const { data: person, error: personError } = await client.from("people").insert({
    tenant_id: tenantId,
    display_name: `${marker} person ${suffix}`,
    first_name: marker,
    last_name: suffix,
    primary_email: `${marker}-${suffix}@example.test`,
    primary_phone: `+33123${suffix === "A" ? "000001" : "000002"}`,
    city: `${marker} city ${suffix}`,
    status: "to_qualify",
    priority: "medium"
  }).select("id").single();
  if (personError) throw personError;

  const { data: organization, error: organizationError } = await client.from("organizations").insert({
    tenant_id: tenantId,
    name: `${marker} organization ${suffix}`,
    legal_name: `${marker} legal ${suffix}`,
    siren: suffix === "A" ? "111222333" : "444555666",
    siret: suffix === "A" ? "11122233300011" : "44455566600022",
    organization_type: "agency",
    city: `${marker} city ${suffix}`,
    status: "active"
  }).select("id").single();
  if (organizationError) throw organizationError;

  const { data: relationship, error: relationshipError } = await client.from("relationships").insert({
    tenant_id: tenantId,
    person_id: person.id,
    organization_id: organization.id,
    relationship_type: "recruiting",
    pipeline_stage: "presentation",
    status: "active"
  }).select("id").single();
  if (relationshipError) throw relationshipError;

  const { data: project, error: projectError } = await client.from("projects").insert({
    tenant_id: tenantId,
    title: `${marker} project ${suffix}`,
    project_type: "recruitment",
    status: "open",
    stage: "new",
    owner_user_id: userId,
    created_by: userId,
    person_id: person.id,
    organization_id: organization.id,
    relationship_id: relationship.id
  }).select("id").single();
  if (projectError) throw projectError;

  const { data: interaction, error: interactionError } = await client.from("interactions").insert({
    tenant_id: tenantId,
    person_id: person.id,
    organization_id: organization.id,
    relationship_id: relationship.id,
    project_id: project.id,
    type_id: interactionType.id,
    title: `${marker} interaction ${suffix}`,
    summary: `${marker} summary ${suffix}`,
    interaction_date: new Date().toISOString()
  }).select("id").single();
  if (interactionError) throw interactionError;

  const { data: task, error: taskError } = await client.from("tasks").insert({
    tenant_id: tenantId,
    title: `${marker} task ${suffix}`,
    reason: `${marker} reason ${suffix}`,
    status: "todo",
    priority: "normal",
    person_id: person.id,
    organization_id: organization.id,
    relationship_id: relationship.id,
    interaction_id: interaction.id,
    project_id: project.id
  }).select("id").single();
  if (taskError) throw taskError;

  return {
    personId: person.id as string,
    organizationId: organization.id as string,
    relationshipId: relationship.id as string,
    projectId: project.id as string,
    interactionId: interaction.id as string,
    taskId: task.id as string
  };
}

describeIntegration("global search RLS integration", () => {
  let tenantA: SupabaseClient;
  let tenantB: SupabaseClient;
  let tenantAId: string;
  let tenantBId: string;
  let fixtureA: Awaited<ReturnType<typeof createSearchableFixture>>;
  let fixtureB: Awaited<ReturnType<typeof createSearchableFixture>>;

  beforeAll(async () => {
    tenantA = await supabaseForUser({ email: process.env.PEOPLE_TEST_TENANT_A_EMAIL!, password: process.env.PEOPLE_TEST_TENANT_A_PASSWORD! });
    tenantB = await supabaseForUser({ email: process.env.PEOPLE_TEST_TENANT_B_EMAIL!, password: process.env.PEOPLE_TEST_TENANT_B_PASSWORD! });
    tenantAId = (await firstTenantId(tenantA))!;
    tenantBId = (await firstTenantId(tenantB))!;
    if (!tenantAId || !tenantBId || tenantAId === tenantBId) throw new Error("Global search integration users must belong to two distinct active tenants.");

    fixtureA = await createSearchableFixture(tenantA, tenantAId, "A");
    fixtureB = await createSearchableFixture(tenantB, tenantBId, "B");
  });

  afterAll(async () => {
    await tenantA?.from("tasks").delete().like("title", `${marker}%`);
    await tenantB?.from("tasks").delete().like("title", `${marker}%`);
    await tenantA?.from("interactions").delete().like("title", `${marker}%`);
    await tenantB?.from("interactions").delete().like("title", `${marker}%`);
    await tenantA?.from("projects").delete().like("title", `${marker}%`);
    await tenantB?.from("projects").delete().like("title", `${marker}%`);
    await tenantA?.from("relationships").delete().eq("id", fixtureA?.relationshipId);
    await tenantB?.from("relationships").delete().eq("id", fixtureB?.relationshipId);
    await tenantA?.from("people").delete().like("display_name", `${marker}%`);
    await tenantB?.from("people").delete().like("display_name", `${marker}%`);
    await tenantA?.from("organizations").delete().like("name", `${marker}%`);
    await tenantB?.from("organizations").delete().like("name", `${marker}%`);
  });

  it("allows each source used by global search to read only same-tenant rows", async () => {
    const checks: Array<[string, string, string]> = [
      ["people", fixtureA.personId, fixtureB.personId],
      ["organizations", fixtureA.organizationId, fixtureB.organizationId],
      ["relationships", fixtureA.relationshipId, fixtureB.relationshipId],
      ["projects", fixtureA.projectId, fixtureB.projectId],
      ["interactions", fixtureA.interactionId, fixtureB.interactionId],
      ["tasks", fixtureA.taskId, fixtureB.taskId]
    ];

    for (const [table, ownTenantId, otherTenantId] of checks) {
      const own = await tenantA.from(table).select("id").eq("id", ownTenantId);
      const other = await tenantA.from(table).select("id").eq("id", otherTenantId);
      expect(own.error).toBeNull();
      expect(own.data).toHaveLength(1);
      expect(other.error).toBeNull();
      expect(other.data).toHaveLength(0);
    }
  });
});
