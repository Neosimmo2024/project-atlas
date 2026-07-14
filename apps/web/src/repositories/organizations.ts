import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildOrganizationDuplicateOrFilter,
  buildOrganizationsSearchOrFilter,
  canDeleteOrganizations,
  findOrganizationDuplicateMatches,
  normalizeOrganizationsListParams,
  type OrganizationDuplicateMatch,
  type OrganizationsSearchParams
} from "@/features/organizations/search";
import type { Organization, Person, Relationship, TenantContext } from "@/types/domain";
import type { OrganizationFormInput } from "@/features/organizations/validation";

export type OrganizationsListResult = {
  organizations: Organization[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type OrganizationPersonLink = {
  person: Person;
  relationship: Relationship;
};

export type OrganizationDetail = {
  organization: Organization;
  parent: Organization | null;
  children: Organization[];
  people: OrganizationPersonLink[];
  relationships: Relationship[];
};

export async function listOrganizations(context: TenantContext, params: OrganizationsSearchParams = {}): Promise<OrganizationsListResult> {
  const supabase = await createSupabaseServerClient();
  const normalized = normalizeOrganizationsListParams(params);

  let query = supabase
    .from("organizations")
    .select("*", { count: "exact" })
    .eq("tenant_id", context.tenantId);

  if (normalized.type) query = query.eq("organization_type", normalized.type);
  if (normalized.status) query = query.eq("status", normalized.status);
  if (normalized.query) {
    query = query.or(buildOrganizationsSearchOrFilter(["name", "city", "primary_email", "primary_phone", "siren"], normalized.query));
  }

  const orderColumn = normalized.sort.startsWith("name") ? "name" : "created_at";
  const ascending = normalized.sort.endsWith("_asc");
  const { data, error, count } = await query
    .order(orderColumn, { ascending })
    .range(normalized.from, normalized.to);

  if (error) throw error;

  const total = count ?? 0;
  return {
    organizations: (data ?? []) as Organization[],
    total,
    page: normalized.page,
    pageSize: normalized.pageSize,
    pageCount: Math.max(Math.ceil(total / normalized.pageSize), 1)
  };
}

export async function listParentOrganizationOptions(context: TenantContext, excludeOrganizationId?: string): Promise<Pick<Organization, "id" | "name">[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("organizations")
    .select("id, name")
    .eq("tenant_id", context.tenantId)
    .order("name", { ascending: true });

  if (excludeOrganizationId) query = query.neq("id", excludeOrganizationId);

  const { data, error } = await query.limit(100);
  if (error) throw error;
  return (data ?? []) as Pick<Organization, "id" | "name">[];
}

export async function getOrganizationDetail(context: TenantContext, organizationId: string): Promise<OrganizationDetail | null> {
  const supabase = await createSupabaseServerClient();
  const { data: organization, error: organizationError } = await supabase
    .from("organizations")
    .select("*")
    .eq("tenant_id", context.tenantId)
    .eq("id", organizationId)
    .maybeSingle();

  if (organizationError) throw organizationError;
  if (!organization) return null;

  let parent: Organization | null = null;
  if (organization.parent_organization_id) {
    const { data: parentRow, error: parentError } = await supabase
      .from("organizations")
      .select("*")
      .eq("tenant_id", context.tenantId)
      .eq("id", organization.parent_organization_id)
      .maybeSingle();

    if (parentError) throw parentError;
    parent = parentRow as Organization | null;
  }

  const { data: children, error: childrenError } = await supabase
    .from("organizations")
    .select("*")
    .eq("tenant_id", context.tenantId)
    .eq("parent_organization_id", organizationId)
    .order("name", { ascending: true });

  if (childrenError) throw childrenError;

  const { data: relationships, error: relationshipsError } = await supabase
    .from("relationships")
    .select("*")
    .eq("tenant_id", context.tenantId)
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false });

  if (relationshipsError) throw relationshipsError;

  const personIds = [...new Set(((relationships ?? []) as Relationship[]).map((relationship) => relationship.person_id).filter(Boolean))];
  let peopleRows: Person[] = [];

  if (personIds.length > 0) {
    const { data: people, error: peopleError } = await supabase
      .from("people")
      .select("*")
      .eq("tenant_id", context.tenantId)
      .in("id", personIds);

    if (peopleError) throw peopleError;
    peopleRows = (people ?? []) as Person[];
  }

  const people = ((relationships ?? []) as Relationship[])
    .map((relationship) => {
      const person = peopleRows.find((item) => item.id === relationship.person_id);
      return person ? { person, relationship } : null;
    })
    .filter(Boolean) as OrganizationPersonLink[];

  return {
    organization: organization as Organization,
    parent,
    children: (children ?? []) as Organization[],
    people,
    relationships: (relationships ?? []) as Relationship[]
  };
}

async function queryDuplicateCandidates(context: TenantContext, input: OrganizationFormInput, excludeOrganizationId?: string) {
  const supabase = await createSupabaseServerClient();
  const filter = buildOrganizationDuplicateOrFilter(input);

  if (!filter) return [];

  let query = supabase
    .from("organizations")
    .select("id, tenant_id, name, siren, siret, primary_email, primary_phone, city, postal_code")
    .eq("tenant_id", context.tenantId)
    .or(filter);

  if (excludeOrganizationId) query = query.neq("id", excludeOrganizationId);

  const { data, error } = await query.limit(10);
  if (error) throw error;
  return data ?? [];
}

export async function findPotentialOrganizationDuplicates(context: TenantContext, input: OrganizationFormInput, excludeOrganizationId?: string): Promise<OrganizationDuplicateMatch[]> {
  const candidates = await queryDuplicateCandidates(context, input, excludeOrganizationId);
  return findOrganizationDuplicateMatches(candidates as OrganizationDuplicateMatch["organization"][], input, context.tenantId, excludeOrganizationId);
}

export async function createOrganization(context: TenantContext, input: OrganizationFormInput) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("organizations")
    .insert({ ...input, tenant_id: context.tenantId })
    .select("*")
    .single();

  if (error) throw error;
  return data as Organization;
}

export async function updateOrganization(context: TenantContext, organizationId: string, input: OrganizationFormInput) {
  if (input.parent_organization_id === organizationId) {
    throw new Error("Une organisation ne peut pas etre son propre parent.");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("organizations")
    .update(input)
    .eq("tenant_id", context.tenantId)
    .eq("id", organizationId)
    .select("*")
    .single();

  if (error) throw error;
  return data as Organization;
}

export async function deleteOrganization(context: TenantContext, organizationId: string) {
  if (!canDeleteOrganizations(context.role)) {
    return { allowed: false, deleted: false };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("organizations")
    .delete()
    .eq("tenant_id", context.tenantId)
    .eq("id", organizationId);

  if (error) throw error;
  return { allowed: true, deleted: true };
}
