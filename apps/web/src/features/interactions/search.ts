import type { Interaction, RoleSlug } from "@/types/domain";
import { escapePostgrestLikePattern, quotePostgrestFilterValue } from "../people/search";

export type InteractionsSearchParams = {
  query?: string;
  typeId?: string;
  personId?: string;
  organizationId?: string;
  relationshipId?: string;
  page?: number;
  pageSize?: number;
};

export function normalizeSearchValue(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export function buildInteractionsSearchOrFilter(columns: string[], query: string) {
  const pattern = quotePostgrestFilterValue(`*${escapePostgrestLikePattern(query.trim())}*`);
  return columns.map((column) => `${column}.ilike.${pattern}`).join(",");
}

export function interactionMatchesSearch(
  interaction: Pick<Interaction, "title" | "summary" | "location" | "comments" | "change_reason" | "main_obstacle" | "timing">,
  query: string
) {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) return true;

  return [
    interaction.title,
    interaction.summary,
    interaction.location,
    interaction.comments,
    interaction.change_reason,
    interaction.main_obstacle,
    interaction.timing
  ].some((value) => normalizeSearchValue(value).includes(normalizedQuery));
}

export function canDeleteInteractions(role: RoleSlug) {
  return role === "owner" || role === "admin";
}

export function normalizeInteractionsListParams(params: InteractionsSearchParams) {
  const pageSize = Math.min(Math.max(Number(params.pageSize) || 10, 1), 50);
  const page = Math.max(Number(params.page) || 1, 1);

  return {
    query: params.query?.trim() || "",
    typeId: params.typeId?.trim() || "",
    personId: params.personId?.trim() || "",
    organizationId: params.organizationId?.trim() || "",
    relationshipId: params.relationshipId?.trim() || "",
    page,
    pageSize,
    from: (page - 1) * pageSize,
    to: page * pageSize - 1
  };
}
