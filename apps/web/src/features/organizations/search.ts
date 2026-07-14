import type { Organization, RoleSlug } from "@/types/domain";
import type { OrganizationFormInput } from "./validation";
import { escapePostgrestLikePattern, quotePostgrestFilterValue } from "../people/search";

export type OrganizationsSearchParams = {
  query?: string;
  type?: string;
  status?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
};

export type OrganizationDuplicateReason = "siren" | "siret" | "email" | "phone" | "name_city" | "name_postal_code";

export type OrganizationDuplicateMatch = {
  organization: Pick<Organization, "id" | "tenant_id" | "name" | "siren" | "siret" | "primary_email" | "primary_phone" | "city" | "postal_code">;
  reasons: OrganizationDuplicateReason[];
};

export function normalizeSearchValue(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export function buildOrganizationsSearchOrFilter(columns: string[], query: string) {
  const pattern = quotePostgrestFilterValue(`*${escapePostgrestLikePattern(query.trim())}*`);
  return columns.map((column) => `${column}.ilike.${pattern}`).join(",");
}

export function buildOrganizationDuplicateOrFilter(input: Pick<OrganizationFormInput, "name" | "siren" | "siret" | "primary_email" | "primary_phone" | "city" | "postal_code">) {
  const filters: string[] = [];

  if (input.siren) filters.push(`siren.eq.${quotePostgrestFilterValue(input.siren)}`);
  if (input.siret) filters.push(`siret.eq.${quotePostgrestFilterValue(input.siret)}`);
  if (input.primary_email) filters.push(`primary_email.eq.${quotePostgrestFilterValue(input.primary_email)}`);
  if (input.primary_phone) filters.push(`primary_phone.eq.${quotePostgrestFilterValue(input.primary_phone)}`);
  if (input.name && input.city) filters.push(`and(name.eq.${quotePostgrestFilterValue(input.name)},city.eq.${quotePostgrestFilterValue(input.city)})`);
  if (input.name && input.postal_code) filters.push(`and(name.eq.${quotePostgrestFilterValue(input.name)},postal_code.eq.${quotePostgrestFilterValue(input.postal_code)})`);

  return filters.join(",");
}

export function canDeleteOrganizations(role: RoleSlug) {
  return role === "owner" || role === "admin";
}

export function organizationMatchesSearch(
  organization: Pick<Organization, "name" | "city" | "primary_email" | "primary_phone" | "siren">,
  query: string
) {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) return true;

  return [
    organization.name,
    organization.city,
    organization.primary_email,
    organization.primary_phone,
    organization.siren
  ].some((value) => normalizeSearchValue(value).includes(normalizedQuery));
}

export function findOrganizationDuplicateMatches(
  organizations: OrganizationDuplicateMatch["organization"][],
  input: Pick<OrganizationFormInput, "name" | "siren" | "siret" | "primary_email" | "primary_phone" | "city" | "postal_code">,
  tenantId: string,
  excludeOrganizationId?: string
): OrganizationDuplicateMatch[] {
  const siren = normalizeSearchValue(input.siren);
  const siret = normalizeSearchValue(input.siret);
  const email = normalizeSearchValue(input.primary_email);
  const phone = normalizeSearchValue(input.primary_phone);
  const name = normalizeSearchValue(input.name);
  const city = normalizeSearchValue(input.city);
  const postalCode = normalizeSearchValue(input.postal_code);

  return organizations
    .filter((organization) => organization.tenant_id === tenantId && organization.id !== excludeOrganizationId)
    .map((organization) => {
      const reasons: OrganizationDuplicateReason[] = [];

      if (siren && normalizeSearchValue(organization.siren) === siren) reasons.push("siren");
      if (siret && normalizeSearchValue(organization.siret) === siret) reasons.push("siret");
      if (email && normalizeSearchValue(organization.primary_email) === email) reasons.push("email");
      if (phone && normalizeSearchValue(organization.primary_phone) === phone) reasons.push("phone");
      if (name && city && normalizeSearchValue(organization.name) === name && normalizeSearchValue(organization.city) === city) reasons.push("name_city");
      if (name && postalCode && normalizeSearchValue(organization.name) === name && normalizeSearchValue(organization.postal_code) === postalCode) reasons.push("name_postal_code");

      return { organization, reasons };
    })
    .filter((match) => match.reasons.length > 0);
}

export function normalizeOrganizationsListParams(params: OrganizationsSearchParams) {
  const pageSize = Math.min(Math.max(Number(params.pageSize) || 10, 1), 50);
  const page = Math.max(Number(params.page) || 1, 1);
  const sort = params.sort === "name_asc" || params.sort === "name_desc" || params.sort === "created_asc" ? params.sort : "created_desc";

  return {
    query: params.query?.trim() || "",
    type: params.type?.trim() || "",
    status: params.status?.trim() || "",
    sort,
    page,
    pageSize,
    from: (page - 1) * pageSize,
    to: page * pageSize - 1
  };
}
