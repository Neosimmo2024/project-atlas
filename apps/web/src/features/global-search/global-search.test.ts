import {
  buildOrganizationSearchResults,
  buildPeopleSearchResults,
  buildProjectSearchResults,
  buildRelationshipSearchResults,
  GLOBAL_SEARCH_MIN_QUERY_LENGTH,
  normalizeGlobalSearchQuery
} from "@/features/global-search/global-search";
import type { Organization, Person, Project } from "@/types/domain";
import { describe, expect, it } from "vitest";

const basePerson = {
  id: "person-a",
  tenant_id: "tenant-a",
  first_name: "Renee",
  last_name: "Durand",
  display_name: "Renee Durand",
  primary_email: "renee@example.test",
  primary_phone: "+33123456789",
  city: "Lyon",
  postal_code: null,
  department: null,
  linkedin_url: null,
  job_title: null,
  comments: null,
  source: null,
  status: "qualified",
  talent_types: [],
  priority: "medium",
  talent_score: null,
  contact_allowed: true,
  do_not_contact: false,
  created_at: "2026-08-01T08:00:00Z",
  updated_at: "2026-08-01T08:00:00Z"
} satisfies Person;

const baseOrganization = {
  id: "organization-a",
  tenant_id: "tenant-a",
  name: "Atlas Conseil",
  legal_name: "Atlas Conseil SAS",
  organization_type: "agency",
  siren: "123456789",
  siret: "12345678900011",
  vat_number: null,
  vat_status: "a_verifier",
  website_url: null,
  address_line1: null,
  address_line2: null,
  city: "Paris",
  postal_code: null,
  department: null,
  country: null,
  primary_phone: null,
  primary_email: null,
  parent_organization_id: null,
  source: null,
  comments: null,
  status: "active",
  contact_allowed: true,
  do_not_contact: false,
  created_at: "2026-08-01T08:00:00Z",
  updated_at: "2026-08-01T08:00:00Z"
} satisfies Organization;

const baseProject = {
  id: "project-a",
  tenant_id: "tenant-a",
  title: "Mandat Lyon",
  short_description: null,
  project_type: "recruitment",
  status: "open",
  stage: "new",
  owner_user_id: "user-a",
  created_by: "user-a",
  organization_id: null,
  person_id: null,
  relationship_id: null,
  estimated_value: null,
  final_value: null,
  currency: "EUR",
  expected_close_at: null,
  won_at: null,
  lost_at: null,
  loss_reason: null,
  closing_note: null,
  archived_at: null,
  metadata: {},
  created_at: "2026-08-01T08:00:00Z",
  updated_at: "2026-08-01T08:00:00Z"
} satisfies Project;

describe("global search matching", () => {
  it("normalizes case and accents", () => {
    expect(normalizeGlobalSearchQuery("  PresentATION  ")).toBe("presentation");
    expect(normalizeGlobalSearchQuery("Renee")).toBe("renee");
  });

  it("starts only from the configured minimum length", () => {
    expect(GLOBAL_SEARCH_MIN_QUERY_LENGTH).toBe(2);
    expect(buildPeopleSearchResults([basePerson], "r")).toHaveLength(0);
  });

  it("finds people by name, email, phone and city", () => {
    expect(buildPeopleSearchResults([basePerson], "durand")[0].href).toBe("/people/person-a");
    expect(buildPeopleSearchResults([basePerson], "renee@")[0].href).toBe("/people/person-a");
    expect(buildPeopleSearchResults([basePerson], "123456")[0].href).toBe("/people/person-a");
    expect(buildPeopleSearchResults([basePerson], "lyon")[0].href).toBe("/people/person-a");
  });

  it("finds organizations by name, legal name, SIREN and SIRET", () => {
    expect(buildOrganizationSearchResults([baseOrganization], "conseil")[0].href).toBe("/organizations/organization-a");
    expect(buildOrganizationSearchResults([baseOrganization], "sas")[0].href).toBe("/organizations/organization-a");
    expect(buildOrganizationSearchResults([baseOrganization], "123456789")[0].href).toBe("/organizations/organization-a");
    expect(buildOrganizationSearchResults([baseOrganization], "00011")[0].href).toBe("/organizations/organization-a");
  });

  it("returns pipeline stage matches as relationship results", () => {
    const results = buildRelationshipSearchResults([{
      id: "relationship-a",
      tenant_id: "tenant-a",
      person_id: "person-a",
      organization_id: "organization-a",
      relationship_type: "recruiting",
      pipeline_stage: "presentation",
      status: "active",
      owner_user_id: "user-a",
      score: null,
      confidence: null,
      next_action_at: null,
      started_at: null,
      ended_at: null,
      last_interaction_at: null,
      notes: null,
      tags: [],
      metadata: {},
      created_at: "2026-08-01T08:00:00Z",
      updated_at: "2026-08-01T08:00:00Z",
      people: { display_name: "Renee Durand" },
      organizations: { name: "Atlas Conseil" }
    }], "presentation");

    expect(results).toMatchObject([{ category: "relationships", href: "/relationships/relationship-a" }]);
  });

  it("ranks exact matches before prefix, content and update date", () => {
    const results = buildProjectSearchResults([
      { ...baseProject, id: "content", title: "Grand mandat ouvert", updated_at: "2026-08-04T08:00:00Z" },
      { ...baseProject, id: "prefix", title: "Mandat Lyon", updated_at: "2026-08-03T08:00:00Z" },
      { ...baseProject, id: "exact", title: "mandat", updated_at: "2026-08-01T08:00:00Z" },
      { ...baseProject, id: "newer-prefix", title: "Mandat recrutement", updated_at: "2026-08-05T08:00:00Z" }
    ], "mandat");

    expect(results.map((result) => result.id)).toEqual(["exact", "newer-prefix", "prefix", "content"]);
  });
});
