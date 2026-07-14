import type { Relationship, RoleSlug } from "@/types/domain";
import { escapePostgrestLikePattern, quotePostgrestFilterValue } from "../people/search";

export type RelationshipsSearchParams = {
  query?: string;
  type?: string;
  status?: string;
  stage?: string;
  page?: number;
  pageSize?: number;
};

export type RelationshipDuplicateMatch = {
  relationship: Pick<Relationship, "id" | "tenant_id" | "person_id" | "organization_id" | "relationship_type" | "status">;
  reasons: ["active_identity"];
};

export function normalizeSearchValue(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export function buildRelationshipsSearchOrFilter(columns: string[], query: string) {
  const pattern = quotePostgrestFilterValue(`*${escapePostgrestLikePattern(query.trim())}*`);
  return columns.map((column) => `${column}.ilike.${pattern}`).join(",");
}

export function relationshipMatchesSearch(
  relationship: Pick<Relationship, "relationship_type" | "pipeline_stage" | "status" | "notes">,
  query: string
) {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) return true;

  return [
    relationship.relationship_type,
    relationship.pipeline_stage,
    relationship.status,
    relationship.notes
  ].some((value) => normalizeSearchValue(value).includes(normalizedQuery));
}

export function findRelationshipDuplicateMatches(
  relationships: RelationshipDuplicateMatch["relationship"][],
  input: Pick<Relationship, "person_id" | "organization_id" | "relationship_type">,
  tenantId: string,
  excludeRelationshipId?: string
): RelationshipDuplicateMatch[] {
  return relationships
    .filter((relationship) =>
      relationship.tenant_id === tenantId &&
      relationship.id !== excludeRelationshipId &&
      relationship.person_id === input.person_id &&
      relationship.organization_id === input.organization_id &&
      relationship.relationship_type === input.relationship_type &&
      (relationship.status === "active" || relationship.status === "paused")
    )
    .map((relationship) => ({ relationship, reasons: ["active_identity"] }));
}

export function canDeleteRelationships(role: RoleSlug) {
  return role === "owner" || role === "admin";
}

export function normalizeRelationshipsListParams(params: RelationshipsSearchParams) {
  const pageSize = Math.min(Math.max(Number(params.pageSize) || 10, 1), 50);
  const page = Math.max(Number(params.page) || 1, 1);

  return {
    query: params.query?.trim() || "",
    type: params.type?.trim() || "",
    status: params.status?.trim() || "",
    stage: params.stage?.trim() || "",
    page,
    pageSize,
    from: (page - 1) * pageSize,
    to: page * pageSize - 1
  };
}
