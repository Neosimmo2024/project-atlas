import { describe, expect, it } from "vitest";
import type { Relationship } from "@/types/domain";
import {
  buildRelationshipsSearchOrFilter,
  canDeleteRelationships,
  findRelationshipDuplicateMatches,
  normalizeRelationshipsListParams,
  relationshipMatchesSearch
} from "./search";
import { parseRelationshipInput } from "./validation";

const baseRelationship: Relationship = {
  id: "relationship-1",
  tenant_id: "tenant-a",
  person_id: "11111111-1111-4111-8111-111111111111",
  organization_id: "22222222-2222-4222-8222-222222222222",
  relationship_type: "recruiting",
  pipeline_stage: "qualification",
  status: "active",
  owner_user_id: null,
  score: 75,
  confidence: 80,
  started_at: "2026-01-01T00:00:00Z",
  ended_at: null,
  next_action_at: "2026-01-05T00:00:00Z",
  last_interaction_at: null,
  notes: "Premier contact avec André",
  tags: ["priority"],
  metadata: { source: "manual" },
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z"
};

describe("relationships validation", () => {
  it("requires person, organization, type, stage, and status", () => {
    const result = parseRelationshipInput({ person_id: "", organization_id: "", relationship_type: "bad", pipeline_stage: "bad", status: "bad" });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain("La personne est obligatoire.");
    expect(result.error?.issues.map((issue) => issue.message)).toContain("L'organisation est obligatoire.");
    expect(result.error?.issues.map((issue) => issue.message)).toContain("Le type selectionne est invalide.");
  });

  it("normalizes tags, metadata, and nullable scores", () => {
    const result = parseRelationshipInput({
      person_id: baseRelationship.person_id,
      organization_id: baseRelationship.organization_id,
      relationship_type: "recruiting",
      pipeline_stage: "detection",
      status: "active",
      score: "",
      confidence: "88",
      tags: "vip, recrutement",
      metadata: "{\"channel\":\"manual\"}"
    });

    expect(result.success).toBe(true);
    expect(result.data?.score).toBeNull();
    expect(result.data?.confidence).toBe(88);
    expect(result.data?.tags).toEqual(["vip", "recrutement"]);
    expect(result.data?.metadata).toEqual({ channel: "manual" });
  });

  it("rejects scores outside 0 and 100", () => {
    const result = parseRelationshipInput({
      person_id: baseRelationship.person_id,
      organization_id: baseRelationship.organization_id,
      relationship_type: "recruiting",
      pipeline_stage: "detection",
      status: "active",
      score: 101
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain("La valeur doit etre comprise entre 0 et 100.");
  });

  it("rejects ended_at before started_at", () => {
    const result = parseRelationshipInput({
      person_id: baseRelationship.person_id,
      organization_id: baseRelationship.organization_id,
      relationship_type: "recruiting",
      pipeline_stage: "detection",
      status: "active",
      started_at: "2026-02-01T10:00",
      ended_at: "2026-01-01T10:00"
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain("La date de fin doit etre posterieure a la date de debut.");
  });
});

describe("relationships search", () => {
  it("matches type, stage, status, and notes", () => {
    expect(relationshipMatchesSearch(baseRelationship, "recruiting")).toBe(true);
    expect(relationshipMatchesSearch(baseRelationship, "qualification")).toBe(true);
    expect(relationshipMatchesSearch(baseRelationship, "active")).toBe(true);
    expect(relationshipMatchesSearch(baseRelationship, "andré")).toBe(true);
    expect(relationshipMatchesSearch(baseRelationship, "supplier")).toBe(false);
  });

  it("normalizes pagination bounds", () => {
    expect(normalizeRelationshipsListParams({ page: -2, pageSize: 200 })).toMatchObject({ page: 1, pageSize: 50, from: 0, to: 49 });
  });

  it.each(["O'Connor", "L'Haÿ-les-Roses", "Jean, Pierre", "André", "Nom (test)"])("quotes special search value %s for PostgREST filters", (value) => {
    const filter = buildRelationshipsSearchOrFilter(["notes", "status"], value);

    expect(filter).toContain(`notes.ilike."*${value}*"`);
    expect(filter).toContain(`status.ilike."*${value}*"`);
  });
});

describe("relationships duplicates", () => {
  it("detects active identical relationships only in the current tenant", () => {
    const matches = findRelationshipDuplicateMatches(
      [
        baseRelationship,
        { ...baseRelationship, id: "relationship-2", tenant_id: "tenant-b" },
        { ...baseRelationship, id: "relationship-3", status: "archived" }
      ],
      baseRelationship,
      "tenant-a"
    );

    expect(matches).toHaveLength(1);
    expect(matches[0]?.reasons).toEqual(["active_identity"]);
  });
});

describe("relationships deletion permissions", () => {
  it("allows only owner and admin roles to delete relationships", () => {
    expect(canDeleteRelationships("owner")).toBe(true);
    expect(canDeleteRelationships("admin")).toBe(true);
    expect(canDeleteRelationships("recruiter")).toBe(false);
    expect(canDeleteRelationships("manager")).toBe(false);
    expect(canDeleteRelationships("reader")).toBe(false);
  });
});
