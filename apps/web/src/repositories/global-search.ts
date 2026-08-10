import {
  buildInteractionSearchResults,
  buildOrganizationSearchResults,
  buildPeopleSearchResults,
  buildProjectSearchResults,
  buildRelationshipSearchResults,
  buildTaskSearchResults,
  emptyGlobalSearchResults,
  GLOBAL_SEARCH_MAX_ROWS_PER_SOURCE,
  GLOBAL_SEARCH_MIN_QUERY_LENGTH,
  normalizeGlobalSearchQuery,
  type GlobalSearchResults,
  type RelationshipSearchRow
} from "@/features/global-search/global-search";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Interaction, Organization, Person, Project, Task, TenantContext } from "@/types/domain";

export async function searchGlobally(context: TenantContext, query: string): Promise<GlobalSearchResults> {
  if (normalizeGlobalSearchQuery(query).length < GLOBAL_SEARCH_MIN_QUERY_LENGTH) return emptyGlobalSearchResults();

  const supabase = await createSupabaseServerClient();
  const [
    people,
    organizations,
    relationships,
    projects,
    interactions,
    tasks
  ] = await Promise.all([
    supabase
      .from("people")
      .select("*")
      .eq("tenant_id", context.tenantId)
      .order("updated_at", { ascending: false })
      .limit(GLOBAL_SEARCH_MAX_ROWS_PER_SOURCE),
    supabase
      .from("organizations")
      .select("*")
      .eq("tenant_id", context.tenantId)
      .order("updated_at", { ascending: false })
      .limit(GLOBAL_SEARCH_MAX_ROWS_PER_SOURCE),
    supabase
      .from("relationships")
      .select("*, people(display_name), organizations(name)")
      .eq("tenant_id", context.tenantId)
      .order("updated_at", { ascending: false })
      .limit(GLOBAL_SEARCH_MAX_ROWS_PER_SOURCE),
    supabase
      .from("projects")
      .select("*")
      .eq("tenant_id", context.tenantId)
      .order("updated_at", { ascending: false })
      .limit(GLOBAL_SEARCH_MAX_ROWS_PER_SOURCE),
    supabase
      .from("interactions")
      .select("*")
      .eq("tenant_id", context.tenantId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(GLOBAL_SEARCH_MAX_ROWS_PER_SOURCE),
    supabase
      .from("tasks")
      .select("*")
      .eq("tenant_id", context.tenantId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(GLOBAL_SEARCH_MAX_ROWS_PER_SOURCE)
  ]);

  for (const result of [people, organizations, relationships, projects, interactions, tasks]) {
    if (result.error) throw result.error;
  }

  return {
    people: buildPeopleSearchResults((people.data ?? []) as Person[], query),
    organizations: buildOrganizationSearchResults((organizations.data ?? []) as Organization[], query),
    relationships: buildRelationshipSearchResults((relationships.data ?? []) as RelationshipSearchRow[], query),
    projects: buildProjectSearchResults((projects.data ?? []) as Project[], query),
    interactions: buildInteractionSearchResults((interactions.data ?? []) as Interaction[], query),
    tasks: buildTaskSearchResults((tasks.data ?? []) as Task[], query)
  };
}

