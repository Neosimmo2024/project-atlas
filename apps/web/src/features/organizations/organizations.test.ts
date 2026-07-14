import { describe, expect, it } from "vitest";
import type { Organization } from "@/types/domain";
import {
  buildOrganizationDuplicateOrFilter,
  buildOrganizationsSearchOrFilter,
  canDeleteOrganizations,
  findOrganizationDuplicateMatches,
  normalizeOrganizationsListParams,
  organizationMatchesSearch
} from "./search";
import { normalizePhone, normalizeSiren, normalizeSiret, parseOrganizationInput } from "./validation";

const baseOrganization: Organization = {
  id: "organization-1",
  tenant_id: "tenant-a",
  name: "L'Agence du Parc",
  legal_name: "Agence du Parc SAS",
  organization_type: "agency",
  siren: "123456789",
  siret: "12345678900011",
  vat_number: "FR00123456789",
  website_url: "https://example.com",
  address_line1: "1 rue du Parc",
  address_line2: null,
  city: "Paris",
  postal_code: "75001",
  department: "75",
  country: "France",
  primary_phone: "+33102030405",
  primary_email: "contact@example.com",
  parent_organization_id: null,
  source: "Referral",
  comments: null,
  status: "active",
  contact_allowed: true,
  do_not_contact: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z"
};

describe("organizations validation", () => {
  it("requires a name and validates urls", () => {
    const result = parseOrganizationInput({ name: "", organization_type: "agency", status: "active", website_url: "not-a-url" });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain("Le nom est obligatoire.");
    expect(result.error?.issues.map((issue) => issue.message)).toContain("Le site internet est invalide.");
  });

  it("normalizes email, phone, siren, and siret", () => {
    const result = parseOrganizationInput({
      name: "Agence Test",
      organization_type: "agency",
      status: "active",
      primary_email: " CONTACT@EXAMPLE.COM ",
      primary_phone: "+33 (0)1 02 03 04 05",
      siren: "123 456 789",
      siret: "123 456 789 00011"
    });

    expect(result.success).toBe(true);
    expect(result.data?.primary_email).toBe("contact@example.com");
    expect(result.data?.primary_phone).toBe("+330102030405");
    expect(result.data?.siren).toBe("123456789");
    expect(result.data?.siret).toBe("12345678900011");
    expect(normalizePhone("01 02 03")).toBe("010203");
    expect(normalizeSiren("123 456 789")).toBe("123456789");
    expect(normalizeSiret("123 456 789 00011")).toBe("12345678900011");
  });

  it("accepts department code 94 and rejects postal code 94100 as a department", () => {
    const valid = parseOrganizationInput({
      name: "Neos Immo",
      organization_type: "network",
      status: "active",
      department: "94"
    });
    const invalid = parseOrganizationInput({
      name: "Neos Immo",
      organization_type: "network",
      status: "active",
      department: "94100"
    });

    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
    expect(invalid.error?.issues.map((issue) => issue.message)).toContain("Le departement doit etre un code departement valide, par exemple 94.");
  });
});

describe("organizations search", () => {
  it("matches name, city, email, phone, and siren", () => {
    expect(organizationMatchesSearch(baseOrganization, "parc")).toBe(true);
    expect(organizationMatchesSearch(baseOrganization, "paris")).toBe(true);
    expect(organizationMatchesSearch(baseOrganization, "example.com")).toBe(true);
    expect(organizationMatchesSearch(baseOrganization, "0203")).toBe(true);
    expect(organizationMatchesSearch(baseOrganization, "123456")).toBe(true);
    expect(organizationMatchesSearch(baseOrganization, "lyon")).toBe(false);
  });

  it("normalizes pagination and sort bounds", () => {
    expect(normalizeOrganizationsListParams({ page: -2, pageSize: 200, sort: "bad" })).toMatchObject({ page: 1, pageSize: 50, sort: "created_desc", from: 0, to: 49 });
  });

  it.each(["L'Agence du Parc", "Groupe Martin, Dupont", "Société (Paris)", "Résidences Côte d'Azur"])("quotes special search value %s for PostgREST filters", (value) => {
    const filter = buildOrganizationsSearchOrFilter(["name", "city"], value);

    expect(filter).toContain(`name.ilike."*${value}*"`);
    expect(filter).toContain(`city.ilike."*${value}*"`);
  });
});

describe("organizations duplicates and hierarchy", () => {
  it("detects duplicates only in the current tenant", () => {
    const matches = findOrganizationDuplicateMatches(
      [
        baseOrganization,
        { ...baseOrganization, id: "organization-2", tenant_id: "tenant-b" }
      ],
      {
        name: "L'Agence du Parc",
        siren: "123456789",
        siret: "12345678900011",
        primary_email: "CONTACT@example.com",
        primary_phone: "+33102030405",
        city: "Paris",
        postal_code: "75001"
      },
      "tenant-a"
    );

    expect(matches).toHaveLength(1);
    expect(matches[0]?.reasons).toEqual(["siren", "siret", "email", "phone", "name_city", "name_postal_code"]);
  });

  it("quotes special duplicate values for PostgREST filters", () => {
    expect(buildOrganizationDuplicateOrFilter({
      name: "Groupe Martin, Dupont",
      siren: "123456789",
      siret: "12345678900011",
      primary_email: "contact.o'connor@example.com",
      primary_phone: "+33 (0)1 02 03 04 05",
      city: "Société (Paris)",
      postal_code: "75001"
    })).toContain("name.eq.\"Groupe Martin, Dupont\"");
  });

  it("documents that an organization cannot be its own parent", () => {
    const organization = { ...baseOrganization, parent_organization_id: baseOrganization.id };
    expect(organization.parent_organization_id).toBe(organization.id);
  });
});

describe("organizations deletion permissions", () => {
  it("allows only owner and admin roles to delete organizations", () => {
    expect(canDeleteOrganizations("owner")).toBe(true);
    expect(canDeleteOrganizations("admin")).toBe(true);
    expect(canDeleteOrganizations("recruiter")).toBe(false);
    expect(canDeleteOrganizations("manager")).toBe(false);
    expect(canDeleteOrganizations("reader")).toBe(false);
  });
});
