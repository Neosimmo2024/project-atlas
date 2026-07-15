import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type TestUser = {
  email: string;
  password: string;
};

const requiredEnv = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "INTERACTIONS_TEST_TENANT_A_EMAIL",
  "INTERACTIONS_TEST_TENANT_A_PASSWORD",
  "INTERACTIONS_TEST_TENANT_B_EMAIL",
  "INTERACTIONS_TEST_TENANT_B_PASSWORD",
  "INTERACTIONS_TEST_NO_TENANT_EMAIL",
  "INTERACTIONS_TEST_NO_TENANT_PASSWORD"
] as const;

const hasIntegrationEnv = requiredEnv.every((key) => Boolean(process.env[key]));
const describeIntegration = hasIntegrationEnv ? describe : describe.skip;
const marker = `interactions-rls-${Date.now()}`;

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

async function firstTypeId(client: SupabaseClient) {
  const { data, error } = await client.from("interaction_types").select("id").eq("slug", "note").limit(1).maybeSingle();
  if (error) throw error;
  return data?.id as string | undefined;
}

async function createPerson(client: SupabaseClient, tenantId: string, suffix: string) {
  const { data, error } = await client.from("people").insert({
    tenant_id: tenantId,
    display_name: `${marker} person ${suffix}`,
    status: "to_qualify",
    priority: "medium"
  }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

describeIntegration("interactions RLS integration", () => {
  let tenantA: SupabaseClient;
  let tenantB: SupabaseClient;
  let noTenant: SupabaseClient;
  let tenantAId: string;
  let tenantBId: string;
  let typeId: string;
  let interactionAId: string;
  let interactionBId: string;
  let personAId: string;
  let personBId: string;

  beforeAll(async () => {
    tenantA = await supabaseForUser({ email: process.env.INTERACTIONS_TEST_TENANT_A_EMAIL!, password: process.env.INTERACTIONS_TEST_TENANT_A_PASSWORD! });
    tenantB = await supabaseForUser({ email: process.env.INTERACTIONS_TEST_TENANT_B_EMAIL!, password: process.env.INTERACTIONS_TEST_TENANT_B_PASSWORD! });
    noTenant = await supabaseForUser({ email: process.env.INTERACTIONS_TEST_NO_TENANT_EMAIL!, password: process.env.INTERACTIONS_TEST_NO_TENANT_PASSWORD! });
    tenantAId = (await firstTenantId(tenantA))!;
    tenantBId = (await firstTenantId(tenantB))!;
    typeId = (await firstTypeId(tenantA))!;
    if (!tenantAId || !tenantBId || tenantAId === tenantBId || !typeId) throw new Error("Integration users and interaction types must be provisioned.");
    personAId = await createPerson(tenantA, tenantAId, "A");
    personBId = await createPerson(tenantB, tenantBId, "B");

    const { data: interactionA, error: errorA } = await tenantA.from("interactions").insert({
      tenant_id: tenantAId,
      person_id: personAId,
      type_id: typeId,
      title: `${marker} tenant A`,
      interaction_date: new Date().toISOString(),
      metadata: { test: marker }
    }).select("id").single();
    if (errorA) throw errorA;
    interactionAId = interactionA.id as string;

    const { data: interactionB, error: errorB } = await tenantB.from("interactions").insert({
      tenant_id: tenantBId,
      person_id: personBId,
      type_id: typeId,
      title: `${marker} tenant B`,
      interaction_date: new Date().toISOString(),
      metadata: { test: marker }
    }).select("id").single();
    if (errorB) throw errorB;
    interactionBId = interactionB.id as string;
  });

  afterAll(async () => {
    await tenantA?.from("interactions").delete().like("title", `${marker}%`);
    await tenantB?.from("interactions").delete().like("title", `${marker}%`);
    await tenantA?.from("people").delete().like("display_name", `${marker}%`);
    await tenantB?.from("people").delete().like("display_name", `${marker}%`);
  });

  it("tenant A reads tenant A interactions", async () => {
    const { data, error } = await tenantA.from("interactions").select("id").eq("id", interactionAId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("tenant A cannot read tenant B interactions", async () => {
    const { data, error } = await tenantA.from("interactions").select("id").eq("id", interactionBId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("tenant A cannot update or delete tenant B interactions", async () => {
    const update = await tenantA.from("interactions").update({ title: `${marker} forbidden update` }).eq("id", interactionBId).select("id");
    expect(update.error).toBeNull();
    expect(update.data).toHaveLength(0);

    const deletion = await tenantA.from("interactions").delete().eq("id", interactionBId).select("id");
    expect(deletion.error).toBeNull();
    expect(deletion.data).toHaveLength(0);
  });

  it("user without active tenant cannot access interactions", async () => {
    const { data, error } = await noTenant.from("interactions").select("id").limit(1);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("browser supplied tenant_id is rejected by RLS when it targets another tenant", async () => {
    const { data, error } = await tenantA.from("interactions").insert({
      tenant_id: tenantBId,
      person_id: personAId,
      type_id: typeId,
      title: `${marker} malicious tenant`,
      interaction_date: new Date().toISOString()
    }).select("id");
    expect(data ?? []).toHaveLength(0);
    expect(error).not.toBeNull();
  });
});
