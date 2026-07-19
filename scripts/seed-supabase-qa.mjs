import { appendFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const url = process.env.QA_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.QA_SUPABASE_SERVICE_ROLE_KEY;

const tenantAUser = {
  email: "qa-tenant-a-owner@atlas.local.test",
  password: required("QA_TENANT_A_PASSWORD"),
  fullName: "Atlas QA Tenant A Owner"
};

const tenantBUser = {
  email: "qa-tenant-b-owner@atlas.local.test",
  password: required("QA_TENANT_B_PASSWORD"),
  fullName: "Atlas QA Tenant B Owner"
};

const noTenantUser = {
  email: "qa-no-tenant@atlas.local.test",
  password: required("QA_NO_TENANT_PASSWORD"),
  fullName: "Atlas QA No Tenant"
};

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function createAdminClient() {
  if (!url) throw new Error("Missing QA_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceRoleKey) throw new Error("Missing QA_SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

async function createUser(supabase, user) {
  const { data, error } = await supabase.auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true,
    user_metadata: {
      full_name: user.fullName
    }
  });
  if (error) throw error;
  if (!data.user?.id) throw new Error(`User ${user.email} was not created`);
  return data.user.id;
}

async function single(operation, label) {
  const { data, error } = await operation;
  if (error) throw new Error(`${label}: ${JSON.stringify(error)}`);
  if (!data) throw new Error(`${label}: no data returned`);
  return data;
}

async function seed() {
  const supabase = createAdminClient();
  const [userAId, userBId, noTenantUserId] = await Promise.all([
    createUser(supabase, tenantAUser),
    createUser(supabase, tenantBUser),
    createUser(supabase, noTenantUser)
  ]);

  const ownerRole = await single(
    supabase.from("roles").select("id").eq("slug", "owner").single(),
    "select owner role"
  );

  const tenantA = await single(
    supabase.from("tenants").insert({ name: "Atlas QA Tenant A", status: "active" }).select("id").single(),
    "insert tenant A"
  );
  const tenantB = await single(
    supabase.from("tenants").insert({ name: "Atlas QA Tenant B", status: "active" }).select("id").single(),
    "insert tenant B"
  );

  await single(
    supabase.from("profiles").insert([
      { id: userAId, email: tenantAUser.email, full_name: tenantAUser.fullName },
      { id: userBId, email: tenantBUser.email, full_name: tenantBUser.fullName },
      { id: noTenantUserId, email: noTenantUser.email, full_name: noTenantUser.fullName }
    ]).select("id"),
    "insert profiles"
  );

  await single(
    supabase.from("tenant_users").insert([
      { tenant_id: tenantA.id, user_id: userAId, role_id: ownerRole.id, status: "active" },
      { tenant_id: tenantB.id, user_id: userBId, role_id: ownerRole.id, status: "active" }
    ]).select("id"),
    "insert tenant users"
  );

  const personA = await single(
    supabase.from("people").insert({
      tenant_id: tenantA.id,
      first_name: "Ariane",
      last_name: "Martin",
      display_name: "Atlas QA Person A",
      primary_email: "qa-person-a@atlas.local.test",
      city: "Ville A",
      status: "qualified",
      priority: "high"
    }).select("id").single(),
    "insert person A"
  );
  const personB = await single(
    supabase.from("people").insert({
      tenant_id: tenantB.id,
      first_name: "Bastien",
      last_name: "Durand",
      display_name: "Atlas QA Person B",
      primary_email: "qa-person-b@atlas.local.test",
      city: "Ville B",
      status: "qualified",
      priority: "high"
    }).select("id").single(),
    "insert person B"
  );

  const organizationA = await single(
    supabase.from("organizations").insert({
      tenant_id: tenantA.id,
      name: "Atlas QA Organization A",
      organization_type: "agency",
      status: "active",
      city: "Ville A"
    }).select("id").single(),
    "insert organization A"
  );
  const organizationB = await single(
    supabase.from("organizations").insert({
      tenant_id: tenantB.id,
      name: "Atlas QA Organization B",
      organization_type: "agency",
      status: "active",
      city: "Ville B"
    }).select("id").single(),
    "insert organization B"
  );

  const relationshipA = await single(
    supabase.from("relationships").insert({
      tenant_id: tenantA.id,
      person_id: personA.id,
      organization_id: organizationA.id,
      relationship_type: "recruiting",
      pipeline_stage: "qualification",
      status: "active",
      owner_user_id: userAId
    }).select("id").single(),
    "insert relationship A"
  );
  const relationshipB = await single(
    supabase.from("relationships").insert({
      tenant_id: tenantB.id,
      person_id: personB.id,
      organization_id: organizationB.id,
      relationship_type: "recruiting",
      pipeline_stage: "qualification",
      status: "active",
      owner_user_id: userBId
    }).select("id").single(),
    "insert relationship B"
  );

  const projectA = await single(
    supabase.from("projects").insert({
      tenant_id: tenantA.id,
      title: "Atlas QA Seed Project A",
      short_description: "Seed project for local CI QA.",
      project_type: "recruitment",
      status: "open",
      stage: "qualification",
      owner_user_id: userAId,
      created_by: userAId,
      person_id: personA.id,
      organization_id: organizationA.id,
      relationship_id: relationshipA.id,
      estimated_value: "1000.00"
    }).select("id").single(),
    "insert project A"
  );
  const projectB = await single(
    supabase.from("projects").insert({
      tenant_id: tenantB.id,
      title: "Atlas QA Seed Project B",
      short_description: "Seed project for tenant isolation QA.",
      project_type: "recruitment",
      status: "open",
      stage: "qualification",
      owner_user_id: userBId,
      created_by: userBId,
      person_id: personB.id,
      organization_id: organizationB.id,
      relationship_id: relationshipB.id,
      estimated_value: "2000.00"
    }).select("id").single(),
    "insert project B"
  );

  const result = {
    tenantAId: tenantA.id,
    tenantBId: tenantB.id,
    userAId,
    userBId,
    noTenantUserId,
    personAId: personA.id,
    personBId: personB.id,
    organizationAId: organizationA.id,
    organizationBId: organizationB.id,
    relationshipAId: relationshipA.id,
    relationshipBId: relationshipB.id,
    projectAId: projectA.id,
    projectBId: projectB.id
  };

  exportForGitHub(result);
  console.log("Seeded Atlas QA tenants, users, people, organizations, relationships, and projects.");
  console.log(`Tenant A project: ${result.projectAId}`);
  console.log(`Tenant B project: ${result.projectBId}`);
}

function exportForGitHub(result) {
  const githubEnv = process.env.GITHUB_ENV;
  if (!githubEnv) return;

  const entries = {
    QA_TENANT_A_ID: result.tenantAId,
    QA_TENANT_B_ID: result.tenantBId,
    QA_USER_A_ID: result.userAId,
    QA_USER_B_ID: result.userBId,
    QA_NO_TENANT_USER_ID: result.noTenantUserId,
    QA_PERSON_A_ID: result.personAId,
    QA_PERSON_B_ID: result.personBId,
    QA_ORGANIZATION_A_ID: result.organizationAId,
    QA_ORGANIZATION_B_ID: result.organizationBId,
    QA_RELATIONSHIP_A_ID: result.relationshipAId,
    QA_RELATIONSHIP_B_ID: result.relationshipBId,
    QA_PROJECT_A_ID: result.projectAId,
    QA_PROJECT_B_ID: result.projectBId
  };

  appendFileSync(githubEnv, Object.entries(entries).map(([key, value]) => `${key}=${value}`).join("\n") + "\n");
}

seed().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
