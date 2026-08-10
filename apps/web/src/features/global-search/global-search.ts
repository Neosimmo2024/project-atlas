import { normalizeSearchValue } from "@/features/people/search";
import type { Interaction, Organization, Person, Project, Relationship, Task } from "@/types/domain";

export type GlobalSearchCategory = "people" | "organizations" | "relationships" | "projects" | "interactions" | "tasks";

export type GlobalSearchResult = {
  id: string;
  category: GlobalSearchCategory;
  title: string;
  subtitle: string | null;
  details: string[];
  href: string;
  updatedAt: string;
  rank: number;
};

export type GlobalSearchResults = Record<GlobalSearchCategory, GlobalSearchResult[]>;

export const GLOBAL_SEARCH_MIN_QUERY_LENGTH = 2;
export const GLOBAL_SEARCH_MAX_ROWS_PER_SOURCE = 500;
export const GLOBAL_SEARCH_MAX_RESULTS_PER_CATEGORY = 25;

export const globalSearchCategoryLabels: Record<GlobalSearchCategory, string> = {
  people: "Personnes",
  organizations: "Organisations",
  relationships: "Relations",
  projects: "Projets",
  interactions: "Echanges",
  tasks: "Taches"
};

export const emptyGlobalSearchResults = (): GlobalSearchResults => ({
  people: [],
  organizations: [],
  relationships: [],
  projects: [],
  interactions: [],
  tasks: []
});

export function normalizeGlobalSearchQuery(query: string) {
  return normalizeSearchValue(query);
}

function compact(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value && value.trim()));
}

function matchRank(values: Array<string | null | undefined>, query: string) {
  const normalizedQuery = normalizeGlobalSearchQuery(query);
  if (normalizedQuery.length < GLOBAL_SEARCH_MIN_QUERY_LENGTH) return null;

  let best: number | null = null;
  for (const value of values) {
    const normalizedValue = normalizeSearchValue(value);
    if (!normalizedValue) continue;
    const current = normalizedValue === normalizedQuery ? 0 : normalizedValue.startsWith(normalizedQuery) ? 1 : normalizedValue.includes(normalizedQuery) ? 2 : null;
    if (current !== null && (best === null || current < best)) best = current;
  }

  return best;
}

function sortResults(results: GlobalSearchResult[]) {
  return [...results]
    .sort((left, right) => {
      if (left.rank !== right.rank) return left.rank - right.rank;
      const date = new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
      if (date !== 0) return date;
      return left.title.localeCompare(right.title);
    })
    .slice(0, GLOBAL_SEARCH_MAX_RESULTS_PER_CATEGORY);
}

export function relationshipTitle(relationship: Pick<Relationship, "relationship_type" | "pipeline_stage" | "status"> & {
  person?: Pick<Person, "display_name"> | null;
  organization?: Pick<Organization, "name"> | null;
}) {
  const person = relationship.person?.display_name ?? "Personne non renseignee";
  const organization = relationship.organization?.name ?? "Organisation non renseignee";
  return `${person} - ${organization}`;
}

export function buildPeopleSearchResults(people: Person[], query: string): GlobalSearchResult[] {
  return sortResults(people.flatMap((person) => {
    const rank = matchRank([person.display_name, person.first_name, person.last_name, person.primary_email, person.primary_phone, person.city], query);
    if (rank === null) return [];
    return [{
      id: person.id,
      category: "people" as const,
      title: person.display_name,
      subtitle: compact([person.primary_email, person.primary_phone]).join(" | ") || null,
      details: compact([person.city, person.status]),
      href: `/people/${person.id}`,
      updatedAt: person.updated_at,
      rank
    }];
  }));
}

export function buildOrganizationSearchResults(organizations: Organization[], query: string): GlobalSearchResult[] {
  return sortResults(organizations.flatMap((organization) => {
    const rank = matchRank([organization.name, organization.legal_name, organization.siren, organization.siret, organization.city], query);
    if (rank === null) return [];
    return [{
      id: organization.id,
      category: "organizations" as const,
      title: organization.name,
      subtitle: organization.legal_name,
      details: compact([organization.siren ? `SIREN ${organization.siren}` : null, organization.siret ? `SIRET ${organization.siret}` : null, organization.city]),
      href: `/organizations/${organization.id}`,
      updatedAt: organization.updated_at,
      rank
    }];
  }));
}

export type RelationshipSearchRow = Relationship & {
  people?: Pick<Person, "display_name"> | null;
  organizations?: Pick<Organization, "name"> | null;
};

export function buildRelationshipSearchResults(relationships: RelationshipSearchRow[], query: string): GlobalSearchResult[] {
  return sortResults(relationships.flatMap((relationship) => {
    const title = relationshipTitle({
      ...relationship,
      person: relationship.people ?? null,
      organization: relationship.organizations ?? null
    });
    const rank = matchRank([title, relationship.relationship_type, relationship.status, relationship.pipeline_stage], query);
    if (rank === null) return [];
    return [{
      id: relationship.id,
      category: "relationships" as const,
      title,
      subtitle: relationship.relationship_type,
      details: compact([relationship.status, relationship.pipeline_stage]),
      href: `/relationships/${relationship.id}`,
      updatedAt: relationship.updated_at,
      rank
    }];
  }));
}

export function buildProjectSearchResults(projects: Project[], query: string): GlobalSearchResult[] {
  return sortResults(projects.flatMap((project) => {
    const rank = matchRank([project.title, project.project_type, project.status], query);
    if (rank === null) return [];
    return [{
      id: project.id,
      category: "projects" as const,
      title: project.title,
      subtitle: project.project_type,
      details: compact([project.status, project.stage]),
      href: `/projects/${project.id}`,
      updatedAt: project.updated_at,
      rank
    }];
  }));
}

export function buildInteractionSearchResults(interactions: Interaction[], query: string): GlobalSearchResult[] {
  return sortResults(interactions.flatMap((interaction) => {
    const rank = matchRank([interaction.title, interaction.summary], query);
    if (rank === null) return [];
    return [{
      id: interaction.id,
      category: "interactions" as const,
      title: interaction.title,
      subtitle: interaction.summary,
      details: compact([interaction.interaction_date]),
      href: `/interactions/${interaction.id}`,
      updatedAt: interaction.updated_at,
      rank
    }];
  }));
}

export function buildTaskSearchResults(tasks: Task[], query: string): GlobalSearchResult[] {
  return sortResults(tasks.flatMap((task) => {
    const rank = matchRank([task.title, task.reason], query);
    if (rank === null) return [];
    return [{
      id: task.id,
      category: "tasks" as const,
      title: task.title,
      subtitle: task.reason,
      details: compact([task.status, task.priority]),
      href: `/tasks/${task.id}`,
      updatedAt: task.updated_at,
      rank
    }];
  }));
}

