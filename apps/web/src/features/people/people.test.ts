import { describe, expect, it } from "vitest";
import type { Person } from "@/types/domain";
import { canDeletePeople, findDuplicateMatches, normalizePeopleListParams, personMatchesSearch } from "./search";
import { parsePersonInput } from "./validation";

const basePerson: Person = {
  id: "person-1",
  tenant_id: "tenant-a",
  first_name: "Ada",
  last_name: "Martin",
  display_name: "Ada Martin",
  primary_email: "ada@example.com",
  primary_phone: "0102030405",
  city: "Lyon",
  postal_code: "69000",
  department: "69",
  linkedin_url: null,
  job_title: "Manager",
  comments: null,
  source: "Referral",
  status: "to_qualify",
  talent_types: [],
  priority: "medium",
  talent_score: 7,
  contact_allowed: true,
  do_not_contact: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z"
};

describe("people validation", () => {
  it("requires a display name and validates score bounds", () => {
    const result = parsePersonInput({ display_name: "", status: "to_qualify", priority: "medium", talent_score: 11 });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain("Le nom d'affichage est obligatoire.");
    expect(result.error?.issues.map((issue) => issue.message)).toContain("Le score maximum est 10.");
  });

  it("normalizes empty optional fields", () => {
    const result = parsePersonInput({ display_name: "Ada Martin", primary_email: "", status: "qualified", priority: "high", talent_score: "" });

    expect(result.success).toBe(true);
    expect(result.data?.primary_email).toBeNull();
    expect(result.data?.talent_score).toBeNull();
  });
});

describe("people search", () => {
  it("matches name, email, phone, and city", () => {
    expect(personMatchesSearch(basePerson, "ada")).toBe(true);
    expect(personMatchesSearch(basePerson, "example.com")).toBe(true);
    expect(personMatchesSearch(basePerson, "0203")).toBe(true);
    expect(personMatchesSearch(basePerson, "lyon")).toBe(true);
    expect(personMatchesSearch(basePerson, "marseille")).toBe(false);
  });

  it("normalizes pagination bounds", () => {
    expect(normalizePeopleListParams({ page: -2, pageSize: 200 })).toMatchObject({ page: 1, pageSize: 50, from: 0, to: 49 });
  });
});

describe("people duplicates", () => {
  it("detects duplicates only in the current tenant", () => {
    const matches = findDuplicateMatches(
      [
        basePerson,
        { ...basePerson, id: "person-2", tenant_id: "tenant-b" }
      ],
      { first_name: "Ada", last_name: "Martin", primary_email: "ADA@example.com", primary_phone: "0102030405", city: "Lyon" },
      "tenant-a"
    );

    expect(matches).toHaveLength(1);
    expect(matches[0]?.reasons).toEqual(["email", "phone", "identity"]);
  });
});

describe("people deletion permissions", () => {
  it("allows only owner and admin roles to delete people", () => {
    expect(canDeletePeople("owner")).toBe(true);
    expect(canDeletePeople("admin")).toBe(true);
    expect(canDeletePeople("recruiter")).toBe(false);
    expect(canDeletePeople("manager")).toBe(false);
    expect(canDeletePeople("reader")).toBe(false);
  });
});
