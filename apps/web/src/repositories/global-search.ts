import {
  buildInteractionSearchResults,
  buildOrganizationSearchResults,
  buildPeopleSearchResults,
  buildProjectSearchResults,
  buildRelationshipSearchResults,
  buildTaskSearchResults,
  emptyGlobalSearchResults,
  GLOBAL_SEARCH_MIN_QUERY_LENGTH,
  normalizeGlobalSearchQuery,
  type GlobalSearchCategory,
  type GlobalSearchResults,
  type RelationshipSearchRow
} from "@/features/global-search/global-search";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Interaction, Organization, Person, Project, Task, TenantContext } from "@/types/domain";

export async function searchGlobally(context: TenantContext, query: string): Promise<GlobalSearchResults> {
  if (normalizeGlobalSearchQuery(query).length < GLOBAL_SEARCH_MIN_QUERY_LENGTH) return emptyGlobalSearchResults();

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("atlas_global_search", {
    p_tenant_id: context.tenantId,
    p_query: query
  });
  if (error) throw error;
  const rows = (data ?? []) as Array<{ category: GlobalSearchCategory; row_data: unknown }>;
  const categoryRows = (category: GlobalSearchCategory) => rows
    .filter((row) => row.category === category)
    .map((row) => row.row_data);

  return {
    people: buildPeopleSearchResults(categoryRows("people") as Person[], query),
    organizations: buildOrganizationSearchResults(categoryRows("organizations") as Organization[], query),
    relationships: buildRelationshipSearchResults(categoryRows("relationships") as RelationshipSearchRow[], query),
    projects: buildProjectSearchResults(categoryRows("projects") as Project[], query),
    interactions: buildInteractionSearchResults(categoryRows("interactions") as Interaction[], query),
    tasks: buildTaskSearchResults(categoryRows("tasks") as Task[], query)
  };
}

