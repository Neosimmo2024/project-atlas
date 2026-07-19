import { escapePostgrestLikePattern, quotePostgrestFilterValue } from "../people/search";

export type ProjectsSearchParams = {
  query?: string;
  organizationId?: string;
  personId?: string;
  relationshipId?: string;
  ownerId?: string;
  type?: string;
  status?: string;
  stage?: string;
  expectedClose?: string;
  action?: string;
  includeArchived?: string | boolean;
  page?: number;
  pageSize?: number;
};

export function buildProjectsSearchOrFilter(columns: string[], query: string) {
  const pattern = quotePostgrestFilterValue(`*${escapePostgrestLikePattern(query.trim())}*`);
  return columns.map((column) => `${column}.ilike.${pattern}`).join(",");
}

export function normalizeProjectsListParams(params: ProjectsSearchParams) {
  const pageSize = Math.min(Math.max(Number(params.pageSize) || 10, 1), 50);
  const page = Math.max(Number(params.page) || 1, 1);
  const includeArchived = params.includeArchived === true || params.includeArchived === "true" || params.includeArchived === "1";

  return {
    query: params.query?.trim() || "",
    organizationId: params.organizationId?.trim() || "",
    personId: params.personId?.trim() || "",
    relationshipId: params.relationshipId?.trim() || "",
    ownerId: params.ownerId?.trim() || "",
    type: params.type?.trim() || "",
    status: params.status?.trim() || "",
    stage: params.stage?.trim() || "",
    expectedClose: params.expectedClose?.trim() || "",
    action: params.action?.trim() || "",
    includeArchived,
    page,
    pageSize,
    from: (page - 1) * pageSize,
    to: page * pageSize - 1
  };
}
