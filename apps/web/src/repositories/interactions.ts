import { buildOrganizationsSearchOrFilter } from "@/features/organizations/search";
import { buildPeopleSearchOrFilter } from "@/features/people/search";
import { buildRelationshipsSearchOrFilter } from "@/features/relationships/search";
import { buildInteractionsSearchOrFilter, canDeleteInteractions, normalizeInteractionsListParams, type InteractionsSearchParams } from "@/features/interactions/search";
import type { InteractionFormInput } from "@/features/interactions/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { recordInteractionCreated, recordInteractionUpdated } from "@/services/timeline-service";
import type { Interaction, InteractionType, Organization, Person, Project, Relationship, TenantContext } from "@/types/domain";

export type InteractionListItem = Interaction & {
  type: Pick<InteractionType, "id" | "slug" | "label"> | null;
  person: Pick<Person, "id" | "display_name" | "primary_email" | "primary_phone" | "city"> | null;
  organization: Pick<Organization, "id" | "name" | "city" | "primary_email" | "primary_phone"> | null;
  relationship: Pick<Relationship, "id" | "relationship_type" | "pipeline_stage" | "status"> | null;
  project: Pick<Project, "id" | "title" | "status" | "stage"> | null;
};

export type InteractionsListResult = {
  interactions: InteractionListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type InteractionDetail = {
  interaction: Interaction;
  type: InteractionType | null;
  person: Person | null;
  organization: Organization | null;
  relationship: Relationship | null;
  project: Project | null;
};

type InteractionJoinedRow = Interaction & {
  interaction_types?: InteractionListItem["type"];
  people?: InteractionListItem["person"];
  organizations?: InteractionListItem["organization"];
  relationships?: InteractionListItem["relationship"];
  projects?: InteractionListItem["project"];
};

function mapInteractionRow(row: InteractionJoinedRow): InteractionListItem {
  return {
    ...row,
    type: row.interaction_types ?? null,
    person: row.people ?? null,
    organization: row.organizations ?? null,
    relationship: row.relationships ?? null,
    project: row.projects ?? null
  };
}

async function interactionSearchFilters(context: TenantContext, query: string) {
  const supabase = await createSupabaseServerClient();
  const filters = [buildInteractionsSearchOrFilter(["title", "summary", "location", "comments", "change_reason", "main_obstacle", "timing"], query)];

  const [{ data: people, error: peopleError }, { data: organizations, error: organizationsError }, { data: relationships, error: relationshipsError }] = await Promise.all([
    supabase
      .from("people")
      .select("id")
      .eq("tenant_id", context.tenantId)
      .or(buildPeopleSearchOrFilter(["display_name", "first_name", "last_name", "primary_email", "primary_phone", "city"], query))
      .limit(100),
    supabase
      .from("organizations")
      .select("id")
      .eq("tenant_id", context.tenantId)
      .or(buildOrganizationsSearchOrFilter(["name", "city", "primary_email", "primary_phone", "siren"], query))
      .limit(100),
    supabase
      .from("relationships")
      .select("id")
      .eq("tenant_id", context.tenantId)
      .or(buildRelationshipsSearchOrFilter(["relationship_type", "pipeline_stage", "status", "notes"], query))
      .limit(100)
  ]);

  if (peopleError) throw peopleError;
  if (organizationsError) throw organizationsError;
  if (relationshipsError) throw relationshipsError;

  const personIds = (people ?? []).map((person) => person.id as string);
  const organizationIds = (organizations ?? []).map((organization) => organization.id as string);
  const relationshipIds = (relationships ?? []).map((relationship) => relationship.id as string);

  if (personIds.length > 0) filters.push(`person_id.in.(${personIds.join(",")})`);
  if (organizationIds.length > 0) filters.push(`organization_id.in.(${organizationIds.join(",")})`);
  if (relationshipIds.length > 0) filters.push(`relationship_id.in.(${relationshipIds.join(",")})`);

  return filters.join(",");
}

export async function listInteractionTypes(context: TenantContext): Promise<InteractionType[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("interaction_types")
    .select("*")
    .or(`tenant_id.is.null,tenant_id.eq.${context.tenantId}`)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  if (error) throw error;
  return (data ?? []) as InteractionType[];
}

export async function listInteractionPeopleOptions(context: TenantContext): Promise<Pick<Person, "id" | "display_name">[]> {
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

export async function listInteractionOrganizationOptions(context: TenantContext): Promise<Pick<Organization, "id" | "name">[]> {
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

export async function listInteractionRelationshipOptions(context: TenantContext): Promise<Pick<Relationship, "id" | "relationship_type" | "pipeline_stage" | "status">[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("relationships")
    .select("id, relationship_type, pipeline_stage, status")
    .eq("tenant_id", context.tenantId)
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) throw error;
  return (data ?? []) as Pick<Relationship, "id" | "relationship_type" | "pipeline_stage" | "status">[];
}

export async function listInteractionProjectOptions(context: TenantContext): Promise<Pick<Project, "id" | "title">[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id, title")
    .eq("tenant_id", context.tenantId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) throw error;
  return (data ?? []) as Pick<Project, "id" | "title">[];
}

export async function listInteractions(context: TenantContext, params: InteractionsSearchParams = {}): Promise<InteractionsListResult> {
  const supabase = await createSupabaseServerClient();
  const normalized = normalizeInteractionsListParams(params);

  let query = supabase
    .from("interactions")
    .select("*, interaction_types(id, slug, label), people(id, display_name, primary_email, primary_phone, city), organizations(id, name, city, primary_email, primary_phone), relationships(id, relationship_type, pipeline_stage, status), projects(id, title, status, stage)", { count: "exact" })
    .eq("tenant_id", context.tenantId)
    .is("deleted_at", null);

  if (normalized.typeId) query = query.eq("type_id", normalized.typeId);
  if (normalized.personId) query = query.eq("person_id", normalized.personId);
  if (normalized.organizationId) query = query.eq("organization_id", normalized.organizationId);
  if (normalized.relationshipId) query = query.eq("relationship_id", normalized.relationshipId);
  if (normalized.projectId) query = query.eq("project_id", normalized.projectId);
  if (normalized.query) query = query.or(await interactionSearchFilters(context, normalized.query));

  const { data, error, count } = await query
    .order("interaction_date", { ascending: false })
    .range(normalized.from, normalized.to);

  if (error) throw error;

  const total = count ?? 0;
  return {
    interactions: ((data ?? []) as InteractionJoinedRow[]).map(mapInteractionRow),
    total,
    page: normalized.page,
    pageSize: normalized.pageSize,
    pageCount: Math.max(Math.ceil(total / normalized.pageSize), 1)
  };
}

export async function getInteractionDetail(context: TenantContext, interactionId: string): Promise<InteractionDetail | null> {
  const supabase = await createSupabaseServerClient();
  const { data: interaction, error: interactionError } = await supabase
    .from("interactions")
    .select("*")
    .eq("tenant_id", context.tenantId)
    .eq("id", interactionId)
    .is("deleted_at", null)
    .maybeSingle();

  if (interactionError) throw interactionError;
  if (!interaction) return null;

  const typedInteraction = interaction as Interaction;
  const [{ data: type, error: typeError }, { data: person, error: personError }, { data: organization, error: organizationError }, { data: relationship, error: relationshipError }, { data: project, error: projectError }] = await Promise.all([
    supabase
      .from("interaction_types")
      .select("*")
      .eq("id", typedInteraction.type_id)
      .maybeSingle(),
    typedInteraction.person_id
      ? supabase.from("people").select("*").eq("tenant_id", context.tenantId).eq("id", typedInteraction.person_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    typedInteraction.organization_id
      ? supabase.from("organizations").select("*").eq("tenant_id", context.tenantId).eq("id", typedInteraction.organization_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    typedInteraction.relationship_id
      ? supabase.from("relationships").select("*").eq("tenant_id", context.tenantId).eq("id", typedInteraction.relationship_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    typedInteraction.project_id
      ? supabase.from("projects").select("*").eq("tenant_id", context.tenantId).eq("id", typedInteraction.project_id).maybeSingle()
      : Promise.resolve({ data: null, error: null })
  ]);

  if (typeError) throw typeError;
  if (personError) throw personError;
  if (organizationError) throw organizationError;
  if (relationshipError) throw relationshipError;
  if (projectError) throw projectError;

  return {
    interaction: typedInteraction,
    type: type as InteractionType | null,
    person: person as Person | null,
    organization: organization as Organization | null,
    relationship: relationship as Relationship | null,
    project: project as Project | null
  };
}

async function assertInteractionReferencesBelongToTenant(context: TenantContext, input: InteractionFormInput) {
  const supabase = await createSupabaseServerClient();

  const { data: type, error: typeError } = await supabase
    .from("interaction_types")
    .select("id")
    .eq("id", input.type_id)
    .or(`tenant_id.is.null,tenant_id.eq.${context.tenantId}`)
    .maybeSingle();

  if (typeError) throw typeError;
  if (!type) throw new Error("Le type d'interaction selectionne est introuvable.");

  if (input.person_id) {
    const { data: person, error: personError } = await supabase
      .from("people")
      .select("id")
      .eq("tenant_id", context.tenantId)
      .eq("id", input.person_id)
      .maybeSingle();
    if (personError) throw personError;
    if (!person) throw new Error("La personne selectionnee est introuvable pour ce tenant.");
  }

  if (input.organization_id) {
    const { data: organization, error: organizationError } = await supabase
      .from("organizations")
      .select("id")
      .eq("tenant_id", context.tenantId)
      .eq("id", input.organization_id)
      .maybeSingle();
    if (organizationError) throw organizationError;
    if (!organization) throw new Error("L'organisation selectionnee est introuvable pour ce tenant.");
  }

  if (input.relationship_id) {
    const { data: relationship, error: relationshipError } = await supabase
      .from("relationships")
      .select("id")
      .eq("tenant_id", context.tenantId)
      .eq("id", input.relationship_id)
      .maybeSingle();
    if (relationshipError) throw relationshipError;
    if (!relationship) throw new Error("La relation selectionnee est introuvable pour ce tenant.");
  }

  if (input.project_id) {
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id")
      .eq("tenant_id", context.tenantId)
      .eq("id", input.project_id)
      .maybeSingle();
    if (projectError) throw projectError;
    if (!project) throw new Error("Le projet selectionne est introuvable pour ce tenant.");
  }
}

export async function createInteraction(context: TenantContext, input: InteractionFormInput) {
  await assertInteractionReferencesBelongToTenant(context, input);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("interactions")
    .insert({ ...input, tenant_id: context.tenantId, created_by: context.userId })
    .select("*")
    .single();

  if (error) throw error;
  const interaction = data as Interaction;
  await recordInteractionCreated(context, interaction);
  return interaction;
}

export async function updateInteraction(context: TenantContext, interactionId: string, input: InteractionFormInput) {
  await assertInteractionReferencesBelongToTenant(context, input);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("interactions")
    .update(input)
    .eq("tenant_id", context.tenantId)
    .eq("id", interactionId)
    .is("deleted_at", null)
    .select("*")
    .single();

  if (error) throw error;
  const interaction = data as Interaction;
  await recordInteractionUpdated(context, interaction);
  return interaction;
}

export async function deleteInteraction(context: TenantContext, interactionId: string) {
  if (!canDeleteInteractions(context.role)) {
    return { allowed: false, deleted: false };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("interactions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("tenant_id", context.tenantId)
    .eq("id", interactionId)
    .is("deleted_at", null);

  if (error) throw error;
  return { allowed: true, deleted: true };
}

export async function listPersonTimelineInteractions(context: TenantContext, personId: string) {
  return listInteractions(context, { personId, page: 1, pageSize: 10 });
}

export async function listOrganizationTimelineInteractions(context: TenantContext, organizationId: string) {
  return listInteractions(context, { organizationId, page: 1, pageSize: 10 });
}

export async function listProjectInteractions(context: TenantContext, projectId: string) {
  return listInteractions(context, { projectId, page: 1, pageSize: 10 });
}
