import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildDuplicateOrFilter, buildPeopleSearchOrFilter, canDeletePeople, findDuplicateMatches, normalizePeopleListParams, type DuplicateMatch, type PeopleSearchParams } from "@/features/people/search";
import type { Organization, Person, Relationship, TenantContext } from "@/types/domain";
import type { PersonFormInput } from "@/features/people/validation";

export type PeopleListResult = {
  people: Person[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type PersonDetail = {
  person: Person;
  organizations: Organization[];
  relationships: Relationship[];
};

export async function listPeople(context: TenantContext, params: PeopleSearchParams = {}): Promise<PeopleListResult> {
  const supabase = await createSupabaseServerClient();
  const normalized = normalizePeopleListParams(params);

  let query = supabase
    .from("people")
    .select("*", { count: "exact" })
    .eq("tenant_id", context.tenantId);

  if (normalized.status) query = query.eq("status", normalized.status);
  if (normalized.priority) query = query.eq("priority", normalized.priority);
  if (normalized.query) {
    query = query.or(buildPeopleSearchOrFilter(["display_name", "first_name", "last_name", "primary_email", "primary_phone", "city"], normalized.query));
  }

  const { data, error, count } = await query
    .order("updated_at", { ascending: false })
    .range(normalized.from, normalized.to);

  if (error) throw error;

  const total = count ?? 0;
  return {
    people: (data ?? []) as Person[],
    total,
    page: normalized.page,
    pageSize: normalized.pageSize,
    pageCount: Math.max(Math.ceil(total / normalized.pageSize), 1)
  };
}

export async function getPersonDetail(context: TenantContext, personId: string): Promise<PersonDetail | null> {
  const supabase = await createSupabaseServerClient();
  const { data: person, error: personError } = await supabase
    .from("people")
    .select("*")
    .eq("tenant_id", context.tenantId)
    .eq("id", personId)
    .maybeSingle();

  if (personError) throw personError;
  if (!person) return null;

  const { data: relationships, error: relationshipsError } = await supabase
    .from("relationships")
    .select("*")
    .eq("tenant_id", context.tenantId)
    .eq("person_id", personId)
    .order("updated_at", { ascending: false });

  if (relationshipsError) throw relationshipsError;

  const organizationIds = [...new Set(((relationships ?? []) as Relationship[]).map((relationship) => relationship.organization_id).filter(Boolean))];
  let organizations: Organization[] = [];

  if (organizationIds.length > 0) {
    const { data: organizationRows, error: organizationsError } = await supabase
      .from("organizations")
      .select("*")
      .eq("tenant_id", context.tenantId)
      .in("id", organizationIds);

    if (organizationsError) throw organizationsError;
    organizations = (organizationRows ?? []) as Organization[];
  }

  return {
    person: person as Person,
    organizations,
    relationships: (relationships ?? []) as Relationship[]
  };
}

async function queryDuplicateCandidates(context: TenantContext, input: Pick<PersonFormInput, "first_name" | "last_name" | "primary_email" | "primary_phone" | "city">, excludePersonId?: string) {
  const supabase = await createSupabaseServerClient();
  const filter = buildDuplicateOrFilter(input);

  if (!filter) return [];

  let query = supabase
    .from("people")
    .select("id, tenant_id, display_name, first_name, last_name, primary_email, primary_phone, city")
    .eq("tenant_id", context.tenantId)
    .or(filter);

  if (excludePersonId) query = query.neq("id", excludePersonId);

  const { data, error } = await query.limit(10);
  if (error) throw error;
  return data ?? [];
}

export async function findPotentialPersonDuplicates(context: TenantContext, input: PersonFormInput, excludePersonId?: string): Promise<DuplicateMatch[]> {
  const candidates = await queryDuplicateCandidates(context, input, excludePersonId);
  return findDuplicateMatches(candidates as DuplicateMatch["person"][], input, context.tenantId, excludePersonId);
}

export async function createPerson(context: TenantContext, input: PersonFormInput) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("people")
    .insert({ ...input, tenant_id: context.tenantId, talent_types: [] })
    .select("*")
    .single();

  if (error) throw error;
  return data as Person;
}

export async function updatePerson(context: TenantContext, personId: string, input: PersonFormInput) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("people")
    .update(input)
    .eq("tenant_id", context.tenantId)
    .eq("id", personId)
    .select("*")
    .single();

  if (error) throw error;
  return data as Person;
}

export async function deletePerson(context: TenantContext, personId: string) {
  if (!canDeletePeople(context.role)) {
    return { allowed: false, deleted: false };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("people")
    .delete()
    .eq("tenant_id", context.tenantId)
    .eq("id", personId);

  if (error) throw error;
  return { allowed: true, deleted: true };
}
