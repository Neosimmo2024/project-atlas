import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
const marker = `projects-rls-${Date.now()}`;

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

describeIntegration("projects RLS integration", () => {
  let tenantA: SupabaseClient;
  let tenantB: SupabaseClient;
  let tenantAContext: { tenant_id: string; user_id: string };
  let tenantBContext: { tenant_id: string; user_id: string };
  let projectAId: string;
  let projectBId: string;
  let personBId: string;
  let organizationBId: string;
  let relationshipBId: string;

  beforeAll(async () => {
    tenantA = await supabaseForUser({ email: process.env.PROJECTS_TEST_TENANT_A_EMAIL!, password: process.env.PROJECTS_TEST_TENANT_A_PASSWORD! });
    tenantB = await supabaseForUser({ email: process.env.PROJECTS_TEST_TENANT_B_EMAIL!, password: process.env.PROJECTS_TEST_TENANT_B_PASSWORD! });
    tenantAContext = (await firstTenantUser(tenantA))!;
    tenantBContext = (await firstTenantUser(tenantB))!;
    if (!tenantAContext || !tenantBContext || tenantAContext.tenant_id === tenantBContext.tenant_id) throw new Error("Integration users must be provisioned in two distinct tenants.");

    const { data: personB, error: personBError } = await tenantB.from("people").insert({ tenant_id: tenantBContext.tenant_id, display_name: `${marker} person B` }).select("id").single();
    if (personBError) throw personBError;
    personBId = personB.id as string;

    const { data: organizationB, error: organizationBError } = await tenantB.from("organizations").insert({ tenant_id: tenantBContext.tenant_id, name: `${marker} org B`, status: "active" }).select("id").single();
    if (organizationBError) throw organizationBError;
    organizationBId = organizationB.id as string;

    const { data: relationshipB, error: relationshipBError } = await tenantB.from("relationships").insert({
      tenant_id: tenantBContext.tenant_id,
      person_id: personBId,
      organization_id: organizationBId,
      relationship_type: "recruiting",
      pipeline_stage: "qualification",
      status: "active"
    }).select("id").single();
    if (relationshipBError) throw relationshipBError;
    relationshipBId = relationshipB.id as string;

    const { data: projectA, error: projectAError } = await tenantA.from("projects").insert({
      tenant_id: tenantAContext.tenant_id,
      title: `${marker} project A`,
      project_type: "recruitment",
      status: "open",
      stage: "new",
      owner_user_id: tenantAContext.user_id
    }).select("id").single();
    if (projectAError) throw projectAError;
    projectAId = projectA.id as string;

    const { data: projectB, error: projectBError } = await tenantB.from("projects").insert({
      tenant_id: tenantBContext.tenant_id,
      title: `${marker} project B`,
      project_type: "recruitment",
      status: "open",
      stage: "new",
      owner_user_id: tenantBContext.user_id
    }).select("id").single();
    if (projectBError) throw projectBError;
    projectBId = projectB.id as string;
  });

  afterAll(async () => {
    await tenantA?.from("projects").delete().like("title", `${marker}%`);
    await tenantB?.from("tasks").delete().like("title", `${marker}%`);
    await tenantB?.from("interactions").delete().like("title", `${marker}%`);
    await tenantB?.from("projects").delete().like("title", `${marker}%`);
    await tenantB?.from("relationships").delete().eq("id", relationshipBId);
    await tenantB?.from("organizations").delete().eq("id", organizationBId);
    await tenantB?.from("people").delete().eq("id", personBId);
  });

  it("prevents cross-tenant project reads and updates", async () => {
    const read = await tenantA.from("projects").select("id").eq("id", projectBId);
    expect(read.error).toBeNull();
    expect(read.data).toHaveLength(0);

    const update = await tenantA.from("projects").update({ title: `${marker} forbidden` }).eq("id", projectBId).select("id");
    expect(update.error).toBeNull();
    expect(update.data).toHaveLength(0);
  });

  it("rejects cross-tenant people, organizations, relationships, owners, tasks, and interactions", async () => {
    expect((await tenantA.from("projects").insert({ tenant_id: tenantAContext.tenant_id, title: `${marker} bad person`, project_type: "recruitment", status: "open", stage: "new", owner_user_id: tenantAContext.user_id, person_id: personBId }).select("id")).error).not.toBeNull();
    expect((await tenantA.from("projects").insert({ tenant_id: tenantAContext.tenant_id, title: `${marker} bad org`, project_type: "recruitment", status: "open", stage: "new", owner_user_id: tenantAContext.user_id, organization_id: organizationBId }).select("id")).error).not.toBeNull();
    expect((await tenantA.from("projects").insert({ tenant_id: tenantAContext.tenant_id, title: `${marker} bad relation`, project_type: "recruitment", status: "open", stage: "new", owner_user_id: tenantAContext.user_id, relationship_id: relationshipBId }).select("id")).error).not.toBeNull();
    expect((await tenantA.from("projects").insert({ tenant_id: tenantAContext.tenant_id, title: `${marker} bad owner`, project_type: "recruitment", status: "open", stage: "new", owner_user_id: tenantBContext.user_id }).select("id")).error).not.toBeNull();
    expect((await tenantB.from("tasks").insert({ tenant_id: tenantBContext.tenant_id, title: `${marker} bad task`, status: "todo", priority: "normal", project_id: projectAId }).select("id")).error).not.toBeNull();
    expect((await tenantB.from("interactions").insert({ tenant_id: tenantBContext.tenant_id, title: `${marker} bad interaction`, type_id: "00000000-0000-0000-0000-000000000000", interaction_date: new Date().toISOString(), organization_id: organizationBId, project_id: projectAId }).select("id")).error).not.toBeNull();
  });
});
