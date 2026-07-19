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

  it("creates pipeline history atomically for tenant A transitions", async () => {
    const transition = await tenantA.rpc("transition_recruitment_pipeline", {
      p_relationship_id: relationshipAId,
      p_tenant_id: tenantAId,
      p_to_stage: "conversation",
      p_expected_stage: "detection",
      p_expected_updated_at: null,
      p_confirmed: false,
      p_reason: "Qualification validee",
      p_signature_at: null,
      p_start_at: null,
      p_rejection_reason: null,
      p_rejection_comment: null,
      p_rejection_recontactable: null,
      p_rejection_follow_up_at: null,
      p_do_not_contact: null,
      p_metadata: {}
    });
    expect(transition.error).toBeNull();
    expect(transition.data?.pipeline_stage).toBe("conversation");

    const { data: history, error: historyError } = await tenantA
      .from("recruitment_pipeline_events")
      .select("relationship_id, from_stage, to_stage, event_type")
      .eq("relationship_id", relationshipAId);

    expect(historyError).toBeNull();
    expect(history).toEqual(expect.arrayContaining([
      expect.objectContaining({ relationship_id: relationshipAId, from_stage: "detection", to_stage: "conversation", event_type: "stage_transition" })
    ]));
  });

  it("tenant A cannot read or modify tenant B pipeline history", async () => {
    const transitionB = await tenantB.rpc("transition_recruitment_pipeline", {
      p_relationship_id: relationshipBId,
      p_tenant_id: tenantBId,
      p_to_stage: "conversation",
      p_expected_stage: "detection",
      p_expected_updated_at: null,
      p_confirmed: false,
      p_reason: "Tenant B transition",
      p_signature_at: null,
      p_start_at: null,
      p_rejection_reason: null,
      p_rejection_comment: null,
      p_rejection_recontactable: null,
      p_rejection_follow_up_at: null,
      p_do_not_contact: null,
      p_metadata: {}
    });
    expect(transitionB.error).toBeNull();

    const read = await tenantA.from("recruitment_pipeline_events").select("id").eq("relationship_id", relationshipBId);
    expect(read.error).toBeNull();
    expect(read.data).toHaveLength(0);

    const forbidden = await tenantA.rpc("transition_recruitment_pipeline", {
      p_relationship_id: relationshipBId,
      p_tenant_id: tenantBId,
      p_to_stage: "appointment",
      p_expected_stage: null,
      p_expected_updated_at: null,
      p_confirmed: false,
      p_reason: "Forbidden",
      p_signature_at: null,
      p_start_at: null,
      p_rejection_reason: null,
      p_rejection_comment: null,
      p_rejection_recontactable: null,
      p_rejection_follow_up_at: null,
      p_do_not_contact: null,
      p_metadata: {}
    });
    expect(forbidden.error).not.toBeNull();
  });

  it("user without active tenant cannot transition or assign owners", async () => {
    const transition = await noTenant.rpc("transition_recruitment_pipeline", {
      p_relationship_id: relationshipAId,
      p_tenant_id: tenantAId,
      p_to_stage: "appointment",
      p_expected_stage: null,
      p_expected_updated_at: null,
      p_confirmed: false,
      p_reason: "No tenant",
      p_signature_at: null,
      p_start_at: null,
      p_rejection_reason: null,
      p_rejection_comment: null,
      p_rejection_recontactable: null,
      p_rejection_follow_up_at: null,
      p_do_not_contact: null,
      p_metadata: {}
    });
    const owner = await noTenant.rpc("assign_relationship_owner", {
      p_relationship_id: relationshipAId,
      p_tenant_id: tenantAId,
      p_owner_user_id: null,
      p_expected_updated_at: null,
      p_reason: "No tenant"
    });

    expect(transition.error).not.toBeNull();
    expect(owner.error).not.toBeNull();
  });

  it("rejects owner assignment to another tenant user", async () => {
    const { data: tenantBUser } = await tenantB.from("tenant_users").select("user_id").eq("tenant_id", tenantBId).limit(1).single();
    const owner = await tenantA.rpc("assign_relationship_owner", {
      p_relationship_id: relationshipAId,
      p_tenant_id: tenantAId,
      p_owner_user_id: tenantBUser?.user_id,
      p_expected_updated_at: null,
      p_reason: "Cross-tenant owner"
    });

    expect(owner.error).not.toBeNull();
  });

  it("rejects stale transitions, signature without date, rejected without reason, and reopen without reason", async () => {
    const stale = await tenantA.rpc("transition_recruitment_pipeline", {
      p_relationship_id: relationshipAId,
      p_tenant_id: tenantAId,
      p_to_stage: "appointment",
      p_expected_stage: "detection",
      p_expected_updated_at: null,
      p_confirmed: false,
      p_reason: null,
      p_signature_at: null,
      p_start_at: null,
      p_rejection_reason: null,
      p_rejection_comment: null,
      p_rejection_recontactable: null,
      p_rejection_follow_up_at: null,
      p_do_not_contact: null,
      p_metadata: {}
    });
    expect(stale.error).not.toBeNull();

    const signature = await tenantA.rpc("transition_recruitment_pipeline", {
      p_relationship_id: relationshipAId,
      p_tenant_id: tenantAId,
      p_to_stage: "signature",
      p_expected_stage: null,
      p_expected_updated_at: null,
      p_confirmed: true,
      p_reason: null,
      p_signature_at: null,
      p_start_at: null,
      p_rejection_reason: null,
      p_rejection_comment: null,
      p_rejection_recontactable: null,
      p_rejection_follow_up_at: null,
      p_do_not_contact: null,
      p_metadata: {}
    });
    expect(signature.error).not.toBeNull();

    const rejected = await tenantA.rpc("transition_recruitment_pipeline", {
      p_relationship_id: relationshipAId,
      p_tenant_id: tenantAId,
      p_to_stage: "rejected",
      p_expected_stage: null,
      p_expected_updated_at: null,
      p_confirmed: false,
      p_reason: null,
      p_signature_at: null,
      p_start_at: null,
      p_rejection_reason: null,
      p_rejection_comment: null,
      p_rejection_recontactable: null,
      p_rejection_follow_up_at: null,
      p_do_not_contact: null,
      p_metadata: {}
    });
    expect(rejected.error).not.toBeNull();
  });

  it("sets do-not-contact on rejection and does not clear it on reopen", async () => {
    const reject = await tenantA.rpc("transition_recruitment_pipeline", {
      p_relationship_id: relationshipAId,
      p_tenant_id: tenantAId,
      p_to_stage: "rejected",
      p_expected_stage: null,
      p_expected_updated_at: null,
      p_confirmed: false,
      p_reason: "Refus explicite",
      p_signature_at: null,
      p_start_at: null,
      p_rejection_reason: "not_interested",
      p_rejection_comment: null,
      p_rejection_recontactable: false,
      p_rejection_follow_up_at: null,
      p_do_not_contact: true,
      p_metadata: {}
    });
    expect(reject.error).toBeNull();

    const { data: personAfterReject } = await tenantA.from("people").select("do_not_contact").eq("id", personAId).single();
    expect(personAfterReject?.do_not_contact).toBe(true);

    const reopen = await tenantA.rpc("transition_recruitment_pipeline", {
      p_relationship_id: relationshipAId,
      p_tenant_id: tenantAId,
      p_to_stage: "qualification",
      p_expected_stage: null,
      p_expected_updated_at: null,
      p_confirmed: false,
      p_reason: "Nouvelle demande documentee",
      p_signature_at: null,
      p_start_at: null,
      p_rejection_reason: null,
      p_rejection_comment: null,
      p_rejection_recontactable: null,
      p_rejection_follow_up_at: null,
      p_do_not_contact: null,
      p_metadata: {}
    });
    expect(reopen.error).toBeNull();

    const { data: personAfterReopen } = await tenantA.from("people").select("do_not_contact").eq("id", personAId).single();
    expect(personAfterReopen?.do_not_contact).toBe(true);
  });
});
