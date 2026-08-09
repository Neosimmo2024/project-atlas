import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it, vi } from "vitest";

const requiredEnv = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "QA_SUPABASE_SERVICE_ROLE_KEY",
  "PROJECTS_TEST_TENANT_A_EMAIL",
  "PROJECTS_TEST_TENANT_A_PASSWORD",
  "PROJECTS_TEST_TENANT_B_EMAIL",
  "PROJECTS_TEST_TENANT_B_PASSWORD"
] as const;

const hasIntegrationEnv = requiredEnv.every((key) => Boolean(process.env[key]));
const describeIntegration = hasIntegrationEnv ? describe : describe.skip;
const marker = `tenant-admin-${Date.now()}`;

if (hasIntegrationEnv) {
  vi.setConfig({ hookTimeout: 30_000, testTimeout: 30_000 });
}

type TestUser = { email: string; password: string };
type UserFixture = { client: SupabaseClient; userId: string; tenantId: string };
type TenantMemberListing = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role_slug: string;
  status: string;
};

function clientFor(key: string) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function supabaseForUser(user: TestUser) {
  const client = clientFor(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
  const { error } = await client.auth.signInWithPassword(user);
  if (error) throw error;
  return client;
}

function serviceClient() {
  return clientFor(process.env.QA_SUPABASE_SERVICE_ROLE_KEY!);
}

async function firstTenantUser(client: SupabaseClient) {
  const { data, error } = await client.from("tenant_users").select("tenant_id, user_id").eq("status", "active").limit(1).maybeSingle();
  if (error) throw error;
  return data as { tenant_id: string; user_id: string } | null;
}

async function roleId(slug: string) {
  const { data, error } = await serviceClient().from("roles").select("id").eq("slug", slug).single();
  if (error) throw error;
  return data.id as string;
}

async function createTenantMember(tenantId: string, role: string, status: "active" | "suspended" | "invited" = "active"): Promise<UserFixture> {
  const email = `${marker}-${role}-${randomUUID()}@atlas.local.test`;
  const password = `Atlas-${randomUUID()}-Aa1!`;
  const { data, error } = await serviceClient().auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user?.id) throw error ?? new Error("Missing created user");

  const userId = data.user.id;
  const { error: profileError } = await serviceClient().from("profiles").upsert({ id: userId, email, full_name: `${role} ${marker}` }, { onConflict: "id" });
  if (profileError) throw profileError;

  const { error: tenantUserError } = await serviceClient().from("tenant_users").upsert({
    tenant_id: tenantId,
    user_id: userId,
    role_id: await roleId(role),
    status
  }, { onConflict: "tenant_id,user_id" });
  if (tenantUserError) throw tenantUserError;

  const client = status === "invited" ? clientFor(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!) : await supabaseForUser({ email, password });
  return { client, userId, tenantId };
}

async function createTenant(name: string) {
  const { data, error } = await serviceClient().from("tenants").insert({ name, status: "active" }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

async function membership(userId: string) {
  const { data, error } = await serviceClient()
    .from("tenant_users")
    .select("status, roles(slug)")
    .eq("user_id", userId)
    .single();
  if (error) throw error;
  const roleJoin = data.roles as { slug?: string } | { slug?: string }[] | null;
  return { status: data.status as string, role: Array.isArray(roleJoin) ? roleJoin[0]?.slug : roleJoin?.slug };
}

describeIntegration("tenant administration RLS integration", () => {
  let tenantA: UserFixture;
  let tenantB: UserFixture;
  let ownerA: UserFixture;
  let adminA: UserFixture;
  let recruiterA: UserFixture;
  let ownerB: UserFixture;

  beforeAll(async () => {
    const tenantAClient = await supabaseForUser({ email: process.env.PROJECTS_TEST_TENANT_A_EMAIL!, password: process.env.PROJECTS_TEST_TENANT_A_PASSWORD! });
    const tenantBClient = await supabaseForUser({ email: process.env.PROJECTS_TEST_TENANT_B_EMAIL!, password: process.env.PROJECTS_TEST_TENANT_B_PASSWORD! });
    const tenantAContext = (await firstTenantUser(tenantAClient))!;
    const tenantBContext = (await firstTenantUser(tenantBClient))!;
    if (!tenantAContext || !tenantBContext || tenantAContext.tenant_id === tenantBContext.tenant_id) throw new Error("Integration users must belong to two distinct tenants.");

    tenantA = { client: tenantAClient, userId: tenantAContext.user_id, tenantId: tenantAContext.tenant_id };
    tenantB = { client: tenantBClient, userId: tenantBContext.user_id, tenantId: tenantBContext.tenant_id };
    ownerA = await createTenantMember(tenantA.tenantId, "owner");
    adminA = await createTenantMember(tenantA.tenantId, "admin");
    recruiterA = await createTenantMember(tenantA.tenantId, "recruiter");
    ownerB = await createTenantMember(tenantB.tenantId, "owner");
  });

  it("refuses direct authenticated insert, update and delete on tenant_users", async () => {
    const role_id = await roleId("reader");
    const directInsert = await ownerA.client.from("tenant_users").insert({ tenant_id: tenantA.tenantId, user_id: randomUUID(), role_id, status: "active" }).select("id");
    expect(directInsert.error).not.toBeNull();

    const directUpdate = await ownerA.client.from("tenant_users").update({ status: "suspended" }).eq("user_id", recruiterA.userId).select("id");
    expect(directUpdate.error).not.toBeNull();

    const directDelete = await ownerA.client.from("tenant_users").delete().eq("user_id", recruiterA.userId).select("id");
    expect(directDelete.error).not.toBeNull();
  });

  it("allows owners to manage roles and status through the RPC", async () => {
    const roleChange = await ownerA.client.rpc("manage_tenant_member", { p_target_user_id: recruiterA.userId, p_action: "change_role", p_role_slug: "manager" });
    expect(roleChange.error).toBeNull();
    expect(await membership(recruiterA.userId)).toMatchObject({ role: "manager", status: "active" });

    const suspend = await ownerA.client.rpc("manage_tenant_member", { p_target_user_id: recruiterA.userId, p_action: "suspend", p_role_slug: null });
    expect(suspend.error).toBeNull();
    expect(await membership(recruiterA.userId)).toMatchObject({ status: "suspended" });

    const reactivate = await ownerA.client.rpc("manage_tenant_member", { p_target_user_id: recruiterA.userId, p_action: "reactivate", p_role_slug: null });
    expect(reactivate.error).toBeNull();
    expect(await membership(recruiterA.userId)).toMatchObject({ status: "active" });
  });

  it("allows only active owners and admins to list same-tenant members with public profile fields", async () => {
    const ownerList = await ownerA.client.rpc("list_tenant_members_for_admin");
    expect(ownerList.error).toBeNull();
    const ownerMembers = (ownerList.data ?? []) as TenantMemberListing[];
    expect(ownerMembers.some((member) => member.user_id === adminA.userId)).toBe(true);
    expect(ownerMembers.some((member) => member.user_id === ownerB.userId)).toBe(false);
    expect(Object.keys(ownerList.data?.[0] ?? {}).sort()).toEqual(["email", "full_name", "role_slug", "status", "user_id"]);

    const adminList = await adminA.client.rpc("list_tenant_members_for_admin");
    expect(adminList.error).toBeNull();
    const adminMembers = (adminList.data ?? []) as TenantMemberListing[];
    expect(adminMembers.some((member) => member.user_id === ownerA.userId)).toBe(true);

    const recruiterList = await recruiterA.client.rpc("list_tenant_members_for_admin");
    expect(recruiterList.error).not.toBeNull();

    const managerA = await createTenantMember(tenantA.tenantId, "manager");
    const managerList = await managerA.client.rpc("list_tenant_members_for_admin");
    expect(managerList.error).not.toBeNull();

    const readerA = await createTenantMember(tenantA.tenantId, "reader");
    const readerList = await readerA.client.rpc("list_tenant_members_for_admin");
    expect(readerList.error).not.toBeNull();

    const suspendedOwner = await createTenantMember(tenantA.tenantId, "owner", "suspended");
    const suspendedList = await suspendedOwner.client.rpc("list_tenant_members_for_admin");
    expect(suspendedList.error).not.toBeNull();

    const anonList = await clientFor(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!).rpc("list_tenant_members_for_admin");
    expect(anonList.error).not.toBeNull();
  });

  it("refuses tenant member listing when a user is not attached or has ambiguous active tenants", async () => {
    const email = `${marker}-detached-${randomUUID()}@atlas.local.test`;
    const password = `Atlas-${randomUUID()}-Aa1!`;
    const { data, error } = await serviceClient().auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user?.id) throw error ?? new Error("Missing detached user");

    const detachedClient = await supabaseForUser({ email, password });
    const detachedList = await detachedClient.rpc("list_tenant_members_for_admin");
    expect(detachedList.error).not.toBeNull();

    const ambiguousEmail = `${marker}-ambiguous-${randomUUID()}@atlas.local.test`;
    const ambiguousPassword = `Atlas-${randomUUID()}-Aa1!`;
    const ambiguousUser = await serviceClient().auth.admin.createUser({
      email: ambiguousEmail,
      password: ambiguousPassword,
      email_confirm: true
    });
    if (ambiguousUser.error || !ambiguousUser.data.user?.id) {
      throw ambiguousUser.error ?? new Error("Missing ambiguous user");
    }

    const secondTenantId = await createTenant(`${marker} second active tenant`);
    const ownerRoleId = await roleId("owner");
    const { error: ambiguousMembershipError } = await serviceClient().from("tenant_users").insert([
      { tenant_id: tenantA.tenantId, user_id: ambiguousUser.data.user.id, role_id: ownerRoleId, status: "active" },
      { tenant_id: secondTenantId, user_id: ambiguousUser.data.user.id, role_id: ownerRoleId, status: "active" }
    ]);
    if (ambiguousMembershipError) throw ambiguousMembershipError;

    const ambiguousClient = await supabaseForUser({ email: ambiguousEmail, password: ambiguousPassword });
    const ambiguousList = await ambiguousClient.rpc("list_tenant_members_for_admin");
    expect(ambiguousList.error).not.toBeNull();
  });

  it("limits admins, rejected actors, invited rows and cross-tenant targets", async () => {
    const adminOwner = await adminA.client.rpc("manage_tenant_member", { p_target_user_id: ownerA.userId, p_action: "suspend", p_role_slug: null });
    expect(adminOwner.error).not.toBeNull();

    const adminPromotion = await adminA.client.rpc("manage_tenant_member", { p_target_user_id: recruiterA.userId, p_action: "change_role", p_role_slug: "owner" });
    expect(adminPromotion.error).not.toBeNull();

    const crossTenant = await ownerA.client.rpc("manage_tenant_member", { p_target_user_id: ownerB.userId, p_action: "suspend", p_role_slug: null });
    expect(crossTenant.error).not.toBeNull();

    const actorSuspended = await createTenantMember(tenantA.tenantId, "admin", "suspended");
    const suspendedAttempt = await actorSuspended.client.rpc("manage_tenant_member", { p_target_user_id: recruiterA.userId, p_action: "suspend", p_role_slug: null });
    expect(suspendedAttempt.error).not.toBeNull();

    const invited = await createTenantMember(tenantA.tenantId, "reader", "invited");
    const invitedAttempt = await ownerA.client.rpc("manage_tenant_member", { p_target_user_id: invited.userId, p_action: "reactivate", p_role_slug: null });
    expect(invitedAttempt.error).not.toBeNull();
  });

  it("protects self suspension and the last active owner, including concurrent attempts", async () => {
    const selfSuspend = await ownerA.client.rpc("manage_tenant_member", { p_target_user_id: ownerA.userId, p_action: "suspend", p_role_slug: null });
    expect(selfSuspend.error).not.toBeNull();

    const soloTenantId = await createTenant(`${marker} solo owner tenant`);
    const soloOwner = await createTenantMember(soloTenantId, "owner");
    const demoteLast = await soloOwner.client.rpc("manage_tenant_member", { p_target_user_id: soloOwner.userId, p_action: "change_role", p_role_slug: "reader" });
    expect(demoteLast.error).not.toBeNull();

    const concurrentTenantId = await createTenant(`${marker} concurrent owner tenant`);
    const ownerOne = await createTenantMember(concurrentTenantId, "owner");
    const ownerTwo = await createTenantMember(concurrentTenantId, "owner");
    const [first, second] = await Promise.all([
      ownerOne.client.rpc("manage_tenant_member", { p_target_user_id: ownerTwo.userId, p_action: "suspend", p_role_slug: null }),
      ownerTwo.client.rpc("manage_tenant_member", { p_target_user_id: ownerOne.userId, p_action: "suspend", p_role_slug: null })
    ]);

    expect([first.error, second.error].filter(Boolean)).toHaveLength(1);
    const activeOwners = await serviceClient()
      .from("tenant_users")
      .select("user_id, roles(slug)")
      .eq("tenant_id", concurrentTenantId)
      .eq("status", "active");
    expect(activeOwners.error).toBeNull();
    expect((activeOwners.data ?? []).some((row) => {
      const roleJoin = row.roles as { slug?: string } | { slug?: string }[] | null;
      return (Array.isArray(roleJoin) ? roleJoin[0]?.slug : roleJoin?.slug) === "owner";
    })).toBe(true);
  });
});
