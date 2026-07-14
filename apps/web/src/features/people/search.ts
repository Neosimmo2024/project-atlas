import type { Person, RoleSlug } from "@/types/domain";
import type { PersonFormInput } from "./validation";

export type PeopleSearchParams = {
  query?: string;
  status?: string;
  priority?: string;
  page?: number;
  pageSize?: number;
};

export type DuplicateReason = "email" | "phone" | "identity";

export type DuplicateMatch = {
  person: Pick<Person, "id" | "tenant_id" | "display_name" | "first_name" | "last_name" | "primary_email" | "primary_phone" | "city">;
  reasons: DuplicateReason[];
};

export function normalizeSearchValue(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export function quotePostgrestFilterValue(value: string) {
  return `"${value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")}"`;
}

export function escapePostgrestLikePattern(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("*", "\\*");
}

export function buildPeopleSearchOrFilter(columns: string[], query: string) {
  const pattern = quotePostgrestFilterValue(`*${escapePostgrestLikePattern(query.trim())}*`);
  return columns.map((column) => `${column}.ilike.${pattern}`).join(",");
}

export function buildDuplicateOrFilter(input: Pick<PersonFormInput, "first_name" | "last_name" | "primary_email" | "primary_phone" | "city">) {
  const filters: string[] = [];

  if (input.primary_email) filters.push(`primary_email.eq.${quotePostgrestFilterValue(input.primary_email)}`);
  if (input.primary_phone) filters.push(`primary_phone.eq.${quotePostgrestFilterValue(input.primary_phone)}`);
  if (input.first_name && input.last_name && input.city) {
    filters.push(
      `and(first_name.eq.${quotePostgrestFilterValue(input.first_name)},last_name.eq.${quotePostgrestFilterValue(input.last_name)},city.eq.${quotePostgrestFilterValue(input.city)})`
    );
  }

  return filters.join(",");
}

export function canDeletePeople(role: RoleSlug) {
  return role === "owner" || role === "admin";
}

export function personMatchesSearch(person: Pick<Person, "display_name" | "first_name" | "last_name" | "primary_email" | "primary_phone" | "city">, query: string) {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) return true;

  return [
    person.display_name,
    person.first_name,
    person.last_name,
    person.primary_email,
    person.primary_phone,
    person.city
  ].some((value) => normalizeSearchValue(value).includes(normalizedQuery));
}

export function findDuplicateMatches(
  people: DuplicateMatch["person"][],
  input: Pick<PersonFormInput, "first_name" | "last_name" | "primary_email" | "primary_phone" | "city">,
  tenantId: string,
  excludePersonId?: string
): DuplicateMatch[] {
  const email = normalizeSearchValue(input.primary_email);
  const phone = normalizeSearchValue(input.primary_phone);
  const firstName = normalizeSearchValue(input.first_name);
  const lastName = normalizeSearchValue(input.last_name);
  const city = normalizeSearchValue(input.city);

  return people
    .filter((person) => person.tenant_id === tenantId && person.id !== excludePersonId)
    .map((person) => {
      const reasons: DuplicateReason[] = [];

      if (email && normalizeSearchValue(person.primary_email) === email) reasons.push("email");
      if (phone && normalizeSearchValue(person.primary_phone) === phone) reasons.push("phone");
      if (
        firstName &&
        lastName &&
        city &&
        normalizeSearchValue(person.first_name) === firstName &&
        normalizeSearchValue(person.last_name) === lastName &&
        normalizeSearchValue(person.city) === city
      ) {
        reasons.push("identity");
      }

      return { person, reasons };
    })
    .filter((match) => match.reasons.length > 0);
}

export function normalizePeopleListParams(params: PeopleSearchParams) {
  const pageSize = Math.min(Math.max(Number(params.pageSize) || 10, 1), 50);
  const page = Math.max(Number(params.page) || 1, 1);

  return {
    query: params.query?.trim() || "",
    status: params.status?.trim() || "",
    priority: params.priority?.trim() || "",
    page,
    pageSize,
    from: (page - 1) * pageSize,
    to: page * pageSize - 1
  };
}
