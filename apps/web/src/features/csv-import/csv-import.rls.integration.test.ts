import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

type TestUser = {
  email: string;
  password: string;
};

type TenantUserContext = {
  tenant_id: string;
  user_id: string;
};

type ImportReport = {
  id?: string;
  idempotent?: boolean;
  status?: string;
  summary?: {
    peopleDeleted?: number;
    peopleKept?: number;
    organizationsDeleted?: number;
    organizationsKept?: number;
    relationshipsCreated?: number;
    relationshipsDeleted?: number;
    relationshipsKept?: number;
  };
  rows?: Array<{
    personId?: string;
    organizationId?: string;
    relationshipId?: string;
    relationshipCreated?: boolean;
    relationshipOutcome?: string;
  }>;
};

const requiredEnv = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "QA_SUPABASE_SERVICE_ROLE_KEY",
  "QA_DB_URL",
  "PROJECTS_TEST_TENANT_A_EMAIL",
  "PROJECTS_TEST_TENANT_A_PASSWORD",
  "PROJECTS_TEST_TENANT_B_EMAIL",
  "PROJECTS_TEST_TENANT_B_PASSWORD"
] as const;

const hasIntegrationEnv = requiredEnv.every((key) => Boolean(process.env[key]));
const describeIntegration = hasIntegrationEnv ? describe : describe.skip;
const marker = `csv-import-rls-${Date.now()}`;

function supabaseForUser(user: TestUser) {
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  return client.auth.signInWithPassword(user).then(({ error }) => {
    if (error) throw error;
    return client;
  });
}

function anonClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function serviceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.QA_SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function executeSql(sql: string) {
  execFileSync("psql", [process.env.QA_DB_URL!, "-X", "-v", "ON_ERROR_STOP=1"], {
    input: sql,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"]
  });
}

function querySql(sql: string) {
  return execFileSync("psql", [process.env.QA_DB_URL!, "-X", "-v", "ON_ERROR_STOP=1", "-t", "-A"], {
    input: sql,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"]
  }).trim();
}

async function firstTenantUser(client: SupabaseClient) {
  const { data, error } = await client.from("tenant_users").select("tenant_id, user_id").eq("status", "active").limit(1).maybeSingle();
  if (error) throw error;
  return data as TenantUserContext | null;
}

async function roleId(slug: string) {
  const { data, error } = await serviceClient().from("roles").select("id").eq("slug", slug).single();
  if (error) throw error;
  return data.id as string;
}

async function createRoleUser(tenantId: string, role: string) {
  const email = `${marker}-${role}-${randomUUID()}@atlas.local.test`;
  const password = `Atlas-${randomUUID()}-Aa1!`;
  const { data, error } = await serviceClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });
  if (error) throw error;
  const userId = data.user?.id;
  if (!userId) throw new Error(`Missing auth user id for ${role}`);

  const role_id = await roleId(role);
  const { error: profileError } = await serviceClient().from("profiles").insert({
    id: userId,
    email,
    full_name: `CSV ${role}`
  });
  if (profileError) throw profileError;

  const { error: tenantUserError } = await serviceClient().from("tenant_users").insert({
    tenant_id: tenantId,
    user_id: userId,
    role_id,
    status: "active"
  });
  if (tenantUserError) throw tenantUserError;

  return { client: await supabaseForUser({ email, password }), userId };
}

function executeArgs(context: TenantUserContext, idempotencyKey: string, rows: unknown[], addToPipeline = false) {
  return {
    p_tenant_id: context.tenant_id,
    p_idempotency_key: idempotencyKey,
    p_source_name: "contacts.csv",
    p_analysis_fingerprint: idempotencyKey,
    p_actor_user_id: context.user_id,
    p_add_to_pipeline: addToPipeline,
    p_rows: rows
  };
}

async function executeImportAsServer(context: TenantUserContext, idempotencyKey: string, rows: unknown[], addToPipeline = false) {
  return serviceClient().rpc("execute_csv_import", executeArgs(context, idempotencyKey, rows, addToPipeline));
}

async function cancelImport(client: SupabaseClient, context: TenantUserContext, importId: string, key: string) {
  return client.rpc("cancel_csv_import", {
    p_tenant_id: context.tenant_id,
    p_import_run_id: importId,
    p_idempotency_key: key,
    p_actor_user_id: context.user_id,
    p_confirm: true
  });
}

async function createPipelineImport(context: TenantUserContext, suffix: string) {
  const execution = await executeImportAsServer(context, `${marker}-${suffix}`, [{
    lineNumber: 2,
    decision: "create_new",
    classification: "new_contact",
    normalizedValues: {
      first_name: "Pipeline",
      last_name: suffix,
      email: `${marker}-${suffix}@example.test`,
      organization: `${marker} ${suffix} Org`
    },
    targetPersonId: null,
    targetOrganizationId: null
  }], true);
  if (execution.error) throw execution.error;

  const report = execution.data as ImportReport;
  const importId = report.id;
  const personId = report.rows?.[0]?.personId;
  const organizationId = report.rows?.[0]?.organizationId;
  const relationshipId = report.rows?.[0]?.relationshipId;
  if (!importId || !personId || !organizationId || !relationshipId) {
    throw new Error(`Missing created import trace for ${suffix}`);
  }

  return {
    report,
    importId,
    personId,
    organizationId,
    relationshipId
  };
}

async function createManualRelationship(context: TenantUserContext, suffix: string) {
  const service = serviceClient();
  const personId = randomUUID();
  const organizationId = randomUUID();
  const relationshipId = randomUUID();

  const { error: personError } = await service.from("people").insert({
    id: personId,
    tenant_id: context.tenant_id,
    display_name: `Manual ${suffix}`,
    primary_email: `${marker}-${suffix}-manual@example.test`
  });
  if (personError) throw personError;

  const { error: orgError } = await service.from("organizations").insert({
    id: organizationId,
    tenant_id: context.tenant_id,
    name: `${marker} ${suffix} Manual Org`
  });
  if (orgError) throw orgError;

  const { error: relationshipError } = await service.from("relationships").insert({
    id: relationshipId,
    tenant_id: context.tenant_id,
    person_id: personId,
    organization_id: organizationId,
    relationship_type: "recruiting",
    pipeline_stage: "detection",
    status: "active"
  });
  if (relationshipError) throw relationshipError;

  return { personId, organizationId, relationshipId };
}

async function systemInteractionTypeId() {
  const { data, error } = await serviceClient().from("interaction_types").select("id").is("tenant_id", null).eq("slug", "call").single();
  if (error) throw error;
  return data.id as string;
}

async function insertImportRun(context: TenantUserContext, suffix: string, report: Record<string, unknown>, counts?: Partial<{
  people_created: number;
  organizations_created: number;
  relationships_created: number;
}>) {
  const id = randomUUID();
  const { error } = await serviceClient().from("csv_import_runs").insert({
    id,
    tenant_id: context.tenant_id,
    requested_by: context.user_id,
    idempotency_key: `${marker}-${suffix}`,
    source_name: "contacts.csv",
    analysis_fingerprint: suffix,
    payload_fingerprint: suffix,
    total_rows: Array.isArray(report.rows) ? report.rows.length : 1,
    people_created: counts?.people_created ?? 0,
    organizations_created: counts?.organizations_created ?? 0,
    relationships_created: counts?.relationships_created ?? 0,
    report
  });
  if (error) throw error;
  return id;
}

async function expectRelationshipExists(relationshipId: string, expected: boolean) {
  const { data, error } = await serviceClient().from("relationships").select("id").eq("id", relationshipId);
  if (error) throw error;
  expect(data).toHaveLength(expected ? 1 : 0);
}

function relationshipCreatedReport(input: {
  lineNumber?: number;
  personId?: string | null;
  organizationId?: string | null;
  relationshipId?: string | null;
}) {
  return {
    rows: [{
      lineNumber: input.lineNumber ?? 2,
      decision: "create_new",
      outcome: "created",
      personCreated: true,
      organizationCreated: true,
      relationshipCreated: true,
      relationshipOutcome: "created",
      personId: input.personId,
      organizationId: input.organizationId,
      relationshipId: input.relationshipId
    }],
    summary: {
      peopleCreated: 1,
      organizationsCreated: 1,
      relationshipsCreated: 1
    }
  };
}

describeIntegration("csv import execution RLS integration", () => {
  let tenantA: SupabaseClient;
  let tenantB: SupabaseClient;
  let tenantAContext: TenantUserContext;
  let tenantBContext: TenantUserContext;

  beforeAll(async () => {
    tenantA = await supabaseForUser({ email: process.env.PROJECTS_TEST_TENANT_A_EMAIL!, password: process.env.PROJECTS_TEST_TENANT_A_PASSWORD! });
    tenantB = await supabaseForUser({ email: process.env.PROJECTS_TEST_TENANT_B_EMAIL!, password: process.env.PROJECTS_TEST_TENANT_B_PASSWORD! });
    tenantAContext = (await firstTenantUser(tenantA))!;
    tenantBContext = (await firstTenantUser(tenantB))!;
    if (!tenantAContext || !tenantBContext || tenantAContext.tenant_id === tenantBContext.tenant_id) throw new Error("Integration users must be provisioned in two distinct tenants.");
  });

  it("prevents direct inserts into import history", async () => {
    const result = await tenantA.from("csv_import_runs").insert({
      tenant_id: tenantAContext.tenant_id,
      requested_by: tenantAContext.user_id,
      idempotency_key: `${marker}-direct`,
      analysis_fingerprint: "[]",
      total_rows: 0
    }).select("id");

    expect(result.error).not.toBeNull();
  });

  it("revokes direct execute_csv_import privileges from public, anon, authenticated and legacy service-role execution", () => {
    const privilegeRows = querySql(`
with public_privileges as (
  select 'public:' || signature || ':' ||
    case
      when p.proacl is null then 'true'
      else exists (
        select 1
        from aclexplode(p.proacl) acl
        where acl.grantee = 0
          and acl.privilege_type = 'EXECUTE'
      )::text
    end as result
  from (
    values
      ('execute_csv_import', 'uuid, text, text, text, jsonb, uuid', 'public.execute_csv_import(uuid, text, text, text, jsonb, uuid)'),
      ('execute_csv_import', 'uuid, text, text, text, jsonb, uuid, boolean', 'public.execute_csv_import(uuid, text, text, text, jsonb, uuid, boolean)')
  ) as checks(function_name, identity_arguments, signature)
  join pg_proc p on p.proname = checks.function_name
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and pg_get_function_identity_arguments(p.oid) = checks.identity_arguments
),
role_privileges as (
  select role_name || ':' || signature || ':' || has_function_privilege(role_name, signature, 'execute')::text as result
  from (
    values
      ('anon', 'public.execute_csv_import(uuid, text, text, text, jsonb, uuid)'),
      ('authenticated', 'public.execute_csv_import(uuid, text, text, text, jsonb, uuid)'),
      ('service_role', 'public.execute_csv_import(uuid, text, text, text, jsonb, uuid)'),
      ('anon', 'public.execute_csv_import(uuid, text, text, text, jsonb, uuid, boolean)'),
      ('authenticated', 'public.execute_csv_import(uuid, text, text, text, jsonb, uuid, boolean)'),
      ('service_role', 'public.execute_csv_import(uuid, text, text, text, jsonb, uuid, boolean)'),
      ('authenticated', 'public._csv_import_actor_has_tenant_role(uuid, uuid, text[])'),
      ('authenticated', 'public._csv_import_created_entity_report(uuid, uuid)'),
      ('authenticated', 'public._csv_import_safe_uuid(text)')
  ) as checks(role_name, signature)
)
select result from public_privileges
union all
select result from role_privileges
order by result;
`);

    expect(privilegeRows.split("\n")).toContain("service_role:public.execute_csv_import(uuid, text, text, text, jsonb, uuid, boolean):true");
    for (const row of privilegeRows.split("\n")) {
      if (row === "service_role:public.execute_csv_import(uuid, text, text, text, jsonb, uuid, boolean):true") continue;
      expect(row.endsWith(":false")).toBe(true);
    }
  });

  it("rejects unauthenticated and authenticated direct PostgREST RPC execution for every tenant role", async () => {
    const directArgs = executeArgs(tenantAContext, `${marker}-direct-rpc`, [], true);
    const anonAttempt = await anonClient().rpc("execute_csv_import", directArgs);
    expect(anonAttempt.error).not.toBeNull();

    for (const role of ["owner", "admin", "manager", "recruiter", "reader"]) {
      const { client, userId } = role === "owner" ? { client: tenantA, userId: tenantAContext.user_id } : await createRoleUser(tenantAContext.tenant_id, role);
      const directAttempt = await client.rpc("execute_csv_import", executeArgs({ tenant_id: tenantAContext.tenant_id, user_id: userId }, `${marker}-direct-${role}`, [], true));
      expect(directAttempt.error).not.toBeNull();
    }
  });

  it("allows only the server service-role path after explicit actor, tenant and role validation", async () => {
    const execution = await executeImportAsServer(tenantAContext, `${marker}-server-success`, [{
      lineNumber: 2,
      decision: "create_new",
      classification: "new_contact",
      normalizedValues: {
        first_name: "Import",
        last_name: "Server",
        email: `${marker}-server@example.test`
      },
      targetPersonId: null,
      targetOrganizationId: null
    }]);
    expect(execution.error).toBeNull();

    const forgedActor = await executeImportAsServer({ tenant_id: tenantAContext.tenant_id, user_id: tenantBContext.user_id }, `${marker}-forged-actor`, [], true);
    expect(forgedActor.error).not.toBeNull();

    const forgedTenant = await executeImportAsServer({ tenant_id: tenantBContext.tenant_id, user_id: tenantAContext.user_id }, `${marker}-forged-tenant`, [], true);
    expect(forgedTenant.error).not.toBeNull();

    const visibleToA = await tenantA.from("csv_import_runs").select("id").eq("idempotency_key", `${marker}-server-success`);
    expect(visibleToA.error).toBeNull();
    expect(visibleToA.data).toHaveLength(1);

    const visibleToB = await tenantB.from("csv_import_runs").select("id").eq("idempotency_key", `${marker}-server-success`);
    expect(visibleToB.error).toBeNull();
    expect(visibleToB.data).toHaveLength(0);
  });

  it("rejects direct link_existing RPC calls before business validation can be bypassed", async () => {
    const execution = await tenantA.rpc("execute_csv_import", executeArgs(tenantAContext, `${marker}-missing-target`, [{
      lineNumber: 2,
      decision: "link_existing",
      classification: "existing_contact_enrichment",
      normalizedValues: {},
      targetPersonId: null,
      targetOrganizationId: null
    }]));

    expect(execution.error).not.toBeNull();
  });

  it("rejects reusing an idempotency key with a different payload fingerprint through the server path", async () => {
    const first = await executeImportAsServer(tenantAContext, `${marker}-changed-payload`, []);
    expect(first.error).toBeNull();

    const changed = await serviceClient().rpc("execute_csv_import", {
      ...executeArgs(tenantAContext, `${marker}-changed-payload`, [], false),
      p_analysis_fingerprint: "different-fingerprint"
    });

    expect(changed.error).not.toBeNull();
  });

  it("keeps cancellation history tenant scoped and blocks direct table writes", async () => {
    const execution = await executeImportAsServer(tenantAContext, `${marker}-cancel-history`, []);
    expect(execution.error).toBeNull();

    const importId = (execution.data as ImportReport | null)?.id;
    expect(importId).toBeTruthy();

    const analysis = await tenantA.rpc("analyze_csv_import_cancellation", {
      p_tenant_id: tenantAContext.tenant_id,
      p_import_run_id: importId,
      p_actor_user_id: tenantAContext.user_id
    });
    expect(analysis.error).toBeNull();

    const cancellation = await cancelImport(tenantA, tenantAContext, importId!, `${marker}-cancel-history-key`);
    expect(cancellation.error).toBeNull();

    const visibleToA = await tenantA.from("csv_import_cancellations").select("id").eq("import_run_id", importId);
    expect(visibleToA.error).toBeNull();
    expect(visibleToA.data).toHaveLength(1);

    const visibleToB = await tenantB.from("csv_import_cancellations").select("id").eq("import_run_id", importId);
    expect(visibleToB.error).toBeNull();
    expect(visibleToB.data).toHaveLength(0);

    const directInsert = await tenantA.from("csv_import_cancellations").insert({
      tenant_id: tenantAContext.tenant_id,
      import_run_id: importId,
      requested_by: tenantAContext.user_id,
      idempotency_key: `${marker}-direct-cancel`
    }).select("id");
    expect(directInsert.error).not.toBeNull();
  });

  it("deletes an intact imported relationship before recalculating and deleting imported person and organization", async () => {
    const fixture = await createPipelineImport(tenantAContext, "complete-delete");
    const cancellation = await cancelImport(tenantA, tenantAContext, fixture.importId, `${marker}-complete-delete-cancel`);
    expect(cancellation.error).toBeNull();
    expect((cancellation.data as ImportReport).status).toBe("complete");
    expect((cancellation.data as ImportReport).summary).toMatchObject({
      relationshipsDeleted: 1,
      peopleDeleted: 1,
      organizationsDeleted: 1
    });
    await expectRelationshipExists(fixture.relationshipId, false);

    const deletedPerson = await serviceClient().from("people").select("id").eq("id", fixture.personId);
    const deletedOrganization = await serviceClient().from("organizations").select("id").eq("id", fixture.organizationId);
    expect(deletedPerson.data).toHaveLength(0);
    expect(deletedOrganization.data).toHaveLength(0);
  });

  it("keeps preexisting or linked relationships and never deletes merely linked entities", async () => {
    const preexisting = await createManualRelationship(tenantAContext, "preexisting");
    const existingExecution = await executeImportAsServer(tenantAContext, `${marker}-preexisting-import`, [{
      lineNumber: 2,
      decision: "link_existing",
      classification: "existing_contact_enrichment",
      normalizedValues: {},
      targetPersonId: preexisting.personId,
      targetOrganizationId: preexisting.organizationId
    }], true);
    expect(existingExecution.error).toBeNull();

    const cancelLinked = await cancelImport(tenantA, tenantAContext, (existingExecution.data as ImportReport).id!, `${marker}-preexisting-cancel`);
    expect(cancelLinked.error).toBeNull();
    expect((cancelLinked.data as ImportReport).status).toBe("none");
    await expectRelationshipExists(preexisting.relationshipId, true);

    const relationshipOnly = await createPipelineImport(tenantAContext, "relationship-linked");
    const linkedImportId = await insertImportRun(tenantAContext, "relationship-linked-run", {
      rows: [{
        lineNumber: 2,
        relationshipCreated: false,
        relationshipLinked: true,
        relationshipId: relationshipOnly.relationshipId,
        personId: relationshipOnly.personId,
        organizationId: relationshipOnly.organizationId
      }],
      summary: { relationshipsLinked: 1 }
    });
    const linkedCancel = await cancelImport(tenantA, tenantAContext, linkedImportId, `${marker}-relationship-linked-cancel`);
    expect(linkedCancel.error).toBeNull();
    expect((linkedCancel.data as ImportReport).status).toBe("none");
    await expectRelationshipExists(relationshipOnly.relationshipId, true);
  });

  it.each([
    ["phase_modifiee_apres_import", async (id: string) => serviceClient().from("relationships").update({ pipeline_stage: "qualification" }).eq("id", id)],
    ["responsable_modifie", async (id: string) => serviceClient().from("relationships").update({ owner_user_id: tenantAContext.user_id }).eq("id", id)],
    ["dependance_task", async (id: string, fixture: Awaited<ReturnType<typeof createPipelineImport>>) => serviceClient().from("tasks").insert({ tenant_id: tenantAContext.tenant_id, title: `${marker}-task`, relationship_id: id, person_id: fixture.personId, organization_id: fixture.organizationId, created_by: tenantAContext.user_id })],
    ["dependance_interaction", async (id: string, fixture: Awaited<ReturnType<typeof createPipelineImport>>) => serviceClient().from("interactions").insert({ tenant_id: tenantAContext.tenant_id, relationship_id: id, person_id: fixture.personId, organization_id: fixture.organizationId, type_id: await systemInteractionTypeId(), title: `${marker}-interaction`, created_by: tenantAContext.user_id })],
    ["dependance_project", async (id: string, fixture: Awaited<ReturnType<typeof createPipelineImport>>) => serviceClient().from("projects").insert({ tenant_id: tenantAContext.tenant_id, title: `${marker}-project`, project_type: "recruitment", owner_user_id: tenantAContext.user_id, created_by: tenantAContext.user_id, relationship_id: id, person_id: fixture.personId, organization_id: fixture.organizationId })],
    ["dependance_timeline", async (id: string) => serviceClient().from("timeline_events").insert({ tenant_id: tenantAContext.tenant_id, event_type: "relationship_created", title: `${marker}-timeline`, created_by: tenantAContext.user_id, relationship_id: id, source_type: "relationship", source_id: id, idempotency_key: `${marker}-${id}` })],
    ["dependance_pipeline_event", async (id: string) => serviceClient().from("recruitment_pipeline_events").insert({ tenant_id: tenantAContext.tenant_id, relationship_id: id, actor_user_id: tenantAContext.user_id, event_type: "stage_transition", from_stage: "detection", to_stage: "qualification" })]
  ])("keeps imported relationships when cancellation detects %s", async (_reason, mutate) => {
    const fixture = await createPipelineImport(tenantAContext, `keep-${_reason}`);
    const mutation = await mutate(fixture.relationshipId, fixture);
    expect(mutation.error).toBeNull();

    const cancellation = await cancelImport(tenantA, tenantAContext, fixture.importId, `${marker}-keep-${_reason}-cancel`);
    expect(cancellation.error).toBeNull();
    expect((cancellation.data as ImportReport).status).toBe("partial");
    expect((cancellation.data as ImportReport).summary?.relationshipsKept).toBe(1);
    await expectRelationshipExists(fixture.relationshipId, true);
  });

  it("keeps relationships referenced by another import and rejects contradictory or insufficient traces", async () => {
    const referenced = await createPipelineImport(tenantAContext, "referenced-by-other-import");
    await insertImportRun(tenantAContext, "other-import-reference", {
      rows: [{ relationshipId: referenced.relationshipId }],
      summary: { relationshipsLinked: 1 }
    });
    const referencedCancel = await cancelImport(tenantA, tenantAContext, referenced.importId, `${marker}-referenced-cancel`);
    expect(referencedCancel.error).toBeNull();
    expect((referencedCancel.data as ImportReport).summary?.relationshipsKept).toBe(1);

    const contradictory = await createManualRelationship(tenantAContext, "contradictory");
    const contradictoryImportId = await insertImportRun(tenantAContext, "contradictory-run", relationshipCreatedReport({
      relationshipId: contradictory.relationshipId,
      personId: randomUUID(),
      organizationId: contradictory.organizationId
    }), { relationships_created: 1 });
    const contradictoryCancel = await cancelImport(tenantA, tenantAContext, contradictoryImportId, `${marker}-contradictory-cancel`);
    expect(contradictoryCancel.error).not.toBeNull();
    await expectRelationshipExists(contradictory.relationshipId, true);

    const incomplete = await createManualRelationship(tenantAContext, "incomplete-trace");
    const incompleteImportId = await insertImportRun(tenantAContext, "incomplete-run", relationshipCreatedReport({
      relationshipId: incomplete.relationshipId,
      personId: incomplete.personId,
      organizationId: null
    }), { relationships_created: 1 });
    const incompleteCancel = await cancelImport(tenantA, tenantAContext, incompleteImportId, `${marker}-incomplete-cancel`);
    expect(incompleteCancel.error).not.toBeNull();
    await expectRelationshipExists(incomplete.relationshipId, true);
  });

  it("keeps old, malformed, absent and cross-tenant relationship traces without deleting data", async () => {
    const oldTrace = await createManualRelationship(tenantAContext, "old-trace");
    const oldImportId = await insertImportRun(tenantAContext, "old-trace-run", { rows: [], summary: { relationshipsCreated: 1 } }, { relationships_created: 1 });
    const oldCancel = await cancelImport(tenantA, tenantAContext, oldImportId, `${marker}-old-trace-cancel`);
    expect(oldCancel.error).not.toBeNull();
    await expectRelationshipExists(oldTrace.relationshipId, true);

    const malformed = await createManualRelationship(tenantAContext, "malformed");
    const malformedImportId = await insertImportRun(tenantAContext, "malformed-run", { rows: { relationshipId: malformed.relationshipId } }, { relationships_created: 1 });
    const malformedCancel = await cancelImport(tenantA, tenantAContext, malformedImportId, `${marker}-malformed-cancel`);
    expect(malformedCancel.error).not.toBeNull();
    await expectRelationshipExists(malformed.relationshipId, true);

    const absentImportId = await insertImportRun(tenantAContext, "absent-run", relationshipCreatedReport({
      relationshipId: randomUUID(),
      personId: randomUUID(),
      organizationId: randomUUID()
    }), { relationships_created: 1 });
    const absentAnalysis = await tenantA.rpc("analyze_csv_import_cancellation", {
      p_tenant_id: tenantAContext.tenant_id,
      p_import_run_id: absentImportId,
      p_actor_user_id: tenantAContext.user_id
    });
    expect(absentAnalysis.error).toBeNull();
    expect((absentAnalysis.data as { relationships?: Array<{ reason?: string }> }).relationships?.[0]?.reason).toBe("deja_absente");

    const otherTenant = await createManualRelationship(tenantBContext, "other-tenant");
    const crossTenantImportId = await insertImportRun(tenantAContext, "cross-tenant-run", relationshipCreatedReport({
      relationshipId: otherTenant.relationshipId,
      personId: otherTenant.personId,
      organizationId: otherTenant.organizationId
    }), { relationships_created: 1 });
    const crossTenantCancel = await cancelImport(tenantA, tenantAContext, crossTenantImportId, `${marker}-cross-tenant-cancel`);
    expect(crossTenantCancel.error).not.toBeNull();
    await expectRelationshipExists(otherTenant.relationshipId, true);
  });

  it("keeps imported relationships after partial cancellation and returns the same result on repeated calls", async () => {
    const fixture = await createPipelineImport(tenantAContext, "partial-repeat");
    const mutation = await serviceClient().from("relationships").update({ pipeline_stage: "qualification" }).eq("id", fixture.relationshipId);
    expect(mutation.error).toBeNull();

    const first = await cancelImport(tenantA, tenantAContext, fixture.importId, `${marker}-partial-repeat-cancel`);
    expect(first.error).toBeNull();
    expect((first.data as ImportReport).status).toBe("partial");
    const second = await cancelImport(tenantA, tenantAContext, fixture.importId, `${marker}-partial-repeat-cancel`);
    expect(second.error).toBeNull();
    expect((second.data as ImportReport).idempotent).toBe(true);
    await expectRelationshipExists(fixture.relationshipId, true);
  });

  it("serializes concurrent cancellation calls and prevents idempotency key reuse on another import while allowing the same key in another tenant", async () => {
    const fixture = await createPipelineImport(tenantAContext, "concurrent");
    const key = `${marker}-concurrent-cancel`;
    const [first, second] = await Promise.all([
      cancelImport(tenantA, tenantAContext, fixture.importId, key),
      cancelImport(tenantA, tenantAContext, fixture.importId, key)
    ]);
    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect([(first.data as ImportReport).idempotent, (second.data as ImportReport).idempotent]).toContain(true);

    const otherImport = await executeImportAsServer(tenantAContext, `${marker}-same-key-other-import`, []);
    const sameTenantReuse = await cancelImport(tenantA, tenantAContext, (otherImport.data as ImportReport).id!, key);
    expect(sameTenantReuse.error).not.toBeNull();

    const tenantBImport = await executeImportAsServer(tenantBContext, `${marker}-same-key-tenant-b`, []);
    const otherTenantSameKey = await cancelImport(tenantB, tenantBContext, (tenantBImport.data as ImportReport).id!, key);
    expect(otherTenantSameKey.error).toBeNull();
  });

  it("rolls back all deletes when an exception happens during cancellation", async () => {
    const fixture = await createPipelineImport(tenantAContext, "rollback");
    executeSql(`
create or replace function public.raise_csv_import_rollback_test()
returns trigger
language plpgsql
as $$
begin
  if old.display_name like 'Pipeline rollback%' then
    raise exception 'forced rollback for csv import test';
  end if;
  return old;
end;
$$;

drop trigger if exists csv_import_rollback_test on public.people;
create trigger csv_import_rollback_test
before delete on public.people
for each row execute function public.raise_csv_import_rollback_test();
`);

    try {
      const cancellation = await cancelImport(tenantA, tenantAContext, fixture.importId, `${marker}-rollback-cancel`);
      expect(cancellation.error).not.toBeNull();
      await expectRelationshipExists(fixture.relationshipId, true);
      const person = await serviceClient().from("people").select("id").eq("id", fixture.personId);
      const organization = await serviceClient().from("organizations").select("id").eq("id", fixture.organizationId);
      expect(person.data).toHaveLength(1);
      expect(organization.data).toHaveLength(1);
    } finally {
      executeSql("drop trigger if exists csv_import_rollback_test on public.people; drop function if exists public.raise_csv_import_rollback_test();");
    }
  });
});
