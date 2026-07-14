import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildRelationshipsSearchOrFilter,
  canDeleteRelationships,
  findRelationshipDuplicateMatches,
  normalizeRelationshipsListParams,
  type RelationshipDuplicateMatch,
  type RelationshipsSearchParams
} from "@/features/relationships/search";
import type { Organization, Person, Relationship, TenantContext } from "@/types/domain";
import type { RelationshipFormInput } from "@/features/relationships/validation";

export type RelationshipListItem = Relationship & {
  person: Pick<Person, "id" | "display_name" | "primary_email" | "primary_phone" | "city"> | null;
  organization: Pick<Organization, "id" | "name" | "city" | "primary_email" | "primary_phone"> | null;
};

export type RelationshipsListResult = {
  relationships: RelationshipListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type RelationshipDetail = {
  relationship: Relationship;
  person: Person | null;
  organization: Organization | null;
};

function mapRelationshipRow(row: Relationship & { people?: RelationshipListItem["person"]; organizations?: RelationshipListItem["organization"] }): RelationshipListItem {
  return {
    ...row,
    person: row.people ?? null,
    organization: row.organizations ?? null
  };
}

export async function listRelationships(context: TenantContext, params: RelationshipsSearchParams = {}): Promise<RelationshipsListResult> {
  const supabase = await createSupabaseServerClient();
  const normalized = normalizeRelationshipsListParams(params);

  let query = supabase
    .from("relationships")
    .select("*, people(id, display_name, primary_email, primary_phone, city), organizations(id, name, city, primary_email, primary_phone)", { count: "exact" })
    .eq("tenant_id", context.tenantId);

  if (normalized.type) query = query.eq("relationship_type", normalized.type);
  if (normalized.status) query = query.eq("status", normalized.status);
  if (normalized.stage) query = query.eq("pipeline_stage", normalized.stage);
  if (normalized.query) {
    query = query.or(buildRelationshipsSearchOrFilter(["relationship_type", "pipeline_stage", "status", "notes"], normalized.query));
  }

  const { data, error, count } = await query
    .order("updated_at", { ascending: false })
    .range(normalized.from, normalized.to);

  if (error) throw error;

  const total = count ?? 0;
  return {
    relationships: ((data ?? []) as (Relationship & { people?: RelationshipListItem["person"]; organizations?: RelationshipListItem["organization"] })[]).map(mapRelationshipRow),
    total,
    page: normalized.page,
    pageSize: normalized.pageSize,
    pageCount: Math.max(Math.ceil(total / normalized.pageSize), 1)
  };
}

export async function listRelationshipPeopleOptions(context: TenantContext): Promise<Pick<Person, "id" | "display_name">[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("people")
    .select("id, display_name")
    .eq("tenant_id", context.tenantId)
    .order("display_name", { ascending: true })
    .limit(200);

  if (error) throw error;
  return (data ?? []) as Pick<Person, "id" | "display_name">[];
}

export async function listRelationshipOrganizationOptions(context: TenantContext): Promise<Pick<Organization, "id" | "name">[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("tenant_id", context.tenantId)
    .order("name", { ascending: true })
    .limit(200);

  if (error) throw error;
  return (data ?? []) as Pick<Organization, "id" | "name">[];
}

export async function getRelationshipDetail(context: TenantContext, relationshipId: string): Promise<RelationshipDetail | null> {
  const supabase = await createSupabaseServerClient();
  const { data: relationship, error: relationshipError } = await supabase
    .from("relationships")
    .select("*")
    .eq("tenant_id", context.tenantId)
    .eq("id", relationshipId)
    .maybeSingle();

  if (relationshipError) throw relationshipError;
  if (!relationship) return null;

  const { data: person, error: personError } = await supabase
    .from("people")
    .select("*")
    .eq("tenant_id", context.tenantId)
    .eq("id", relationship.person_id)
    .maybeSingle();

  if (personError) throw personError;

  const { data: organization, error: organizationError } = await supabase
    .from("organizations")
    .select("*")
    .eq("tenant_id", context.tenantId)
    .eq("id", relationship.organization_id)
    .maybeSingle();

  if (organizationError) throw organizationError;

  return {
    relationship: relationship as Relationship,
    person: person as Person | null,
    organization: organization as Organization | null
  };
}

async function assertRelationshipReferencesBelongToTenant(context: TenantContext, input: Pick<RelationshipFormInput, "person_id" | "organization_id">) {
  const supabase = await createSupabaseServerClient();
  const [{ data: person, error: personError }, { data: organization, error: organizationError }] = await Promise.all([
    supabase
      .from("people")
      .select("id")
      .eq("tenant_id", context.tenantId)
      .eq("id", input.person_id)
      .maybeSingle(),
    supabase
      .from("organizations")
      .select("id")
      .eq("tenant_id", context.tenantId)
      .eq("id", input.organization_id)
      .maybeSingle()
  ]);

  if (personError) throw personError;
  if (organizationError) throw organizationError;
  if (!person) throw new Error("La personne selectionnee est introuvable pour ce tenant.");
  if (!organization) throw new Error("L'organisation selectionnee est introuvable pour ce tenant.");
}

async function queryDuplicateCandidates(context: TenantContext, input: Pick<RelationshipFormInput, "person_id" | "organization_id" | "relationship_type">, excludeRelationshipId?: string) {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("relationships")
    .select("id, tenant_id, person_id, organization_id, relationship_type, status")
    .eq("tenant_id", context.tenantId)
    .eq("person_id", input.person_id)
    .eq("organization_id", input.organization_id)
    .eq("relationship_type", input.relationship_type)
    .in("status", ["active", "paused"]);

  if (excludeRelationshipId) query = query.neq("id", excludeRelationshipId);

  const { data, error } = await query.limit(10);
  if (error) throw error;
  return data ?? [];
}

export async function findPotentialRelationshipDuplicates(context: TenantContext, input: RelationshipFormInput, excludeRelationshipId?: string): Promise<RelationshipDuplicateMatch[]> {
  const candidates = await queryDuplicateCandidates(context, input, excludeRelationshipId);
  return findRelationshipDuplicateMatches(candidates as RelationshipDuplicateMatch["relationship"][], input, context.tenantId, excludeRelationshipId);
}

export async function createRelationship(context: TenantContext, input: RelationshipFormInput) {
  await assertRelationshipReferencesBelongToTenant(context, input);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("relationships")
    .insert({ ...input, tenant_id: context.tenantId })
    .select("*")
    .single();

  if (error) throw error;
  return data as Relationship;
}

export async function updateRelationship(context: TenantContext, relationshipId: string, input: RelationshipFormInput) {
  await assertRelationshipReferencesBelongToTenant(context, input);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("relationships")
    .update(input)
    .eq("tenant_id", context.tenantId)
    .eq("id", relationshipId)
    .select("*")
    .single();

  if (error) throw error;
  return data as Relationship;
}

export async function deleteRelationship(context: TenantContext, relationshipId: string) {
  if (!canDeleteRelationships(context.role)) {
    return { allowed: false, deleted: false };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("relationships")
    .delete()
    .eq("tenant_id", context.tenantId)
    .eq("id", relationshipId);

  if (error) throw error;
  return { allowed: true, deleted: true };
}
