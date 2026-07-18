import { describe, expect, it } from "vitest";
import type { Interaction } from "@/types/domain";
import { buildInteractionsSearchOrFilter, canDeleteInteractions, interactionMatchesSearch, normalizeInteractionsListParams } from "./search";
import { parseInteractionInput } from "./validation";

const baseInteraction: Interaction = {
  id: "interaction-1",
  tenant_id: "tenant-a",
  person_id: "11111111-1111-4111-8111-111111111111",
  organization_id: null,
  relationship_id: null,
  project_id: null,
  type_id: "22222222-2222-4222-8222-222222222222",
  title: "Appel de qualification",
  summary: "Conversation avec André",
  interaction_date: "2026-01-01T10:00:00Z",
  duration_minutes: 30,
  location: "Telephone",
  created_by: "33333333-3333-4333-8333-333333333333",
  change_reason: "Souhaite evoluer",
  main_obstacle: "Timing",
  timing: "T3",
  dna_compatibility: "Bonne",
  work_with_person_desire: "Oui",
  comments: "A rappeler",
  metadata: { channel: "manual" },
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  deleted_at: null
};

describe("interactions validation", () => {
  it("requires a title, type, date, and at least one target", () => {
    const result = parseInteractionInput({ title: "", type_id: "", interaction_date: "", duration_minutes: 2000 });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain("Le titre est obligatoire.");
    expect(result.error?.issues.map((issue) => issue.message)).toContain("Le type d'interaction est obligatoire.");
    expect(result.error?.issues.map((issue) => issue.message)).toContain("La date de l'interaction est obligatoire.");
    expect(result.error?.issues.map((issue) => issue.message)).toContain("La duree doit etre comprise entre 0 et 1440 minutes.");
    expect(result.error?.issues.map((issue) => issue.message)).toContain("Selectionnez au moins une personne, une organisation, une relation ou un projet.");
  });

  it("normalizes nullable fields and metadata", () => {
    const result = parseInteractionInput({
      person_id: baseInteraction.person_id,
      type_id: baseInteraction.type_id,
      title: "Note",
      interaction_date: "2026-01-01T10:00",
      duration_minutes: "",
      summary: "",
      metadata: "{\"source\":\"manual\"}"
    });

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("Expected interaction payload to be valid.");
    expect(result.data.duration_minutes).toBeNull();
    expect(result.data.summary).toBeNull();
    expect(result.data.metadata).toEqual({ source: "manual" });
  });
});

describe("interactions search", () => {
  it("matches interaction text fields", () => {
    expect(interactionMatchesSearch(baseInteraction, "qualification")).toBe(true);
    expect(interactionMatchesSearch(baseInteraction, "andré")).toBe(true);
    expect(interactionMatchesSearch(baseInteraction, "timing")).toBe(true);
    expect(interactionMatchesSearch(baseInteraction, "absent")).toBe(false);
  });

  it("normalizes pagination bounds", () => {
    expect(normalizeInteractionsListParams({ page: -2, pageSize: 200 })).toMatchObject({ page: 1, pageSize: 50, from: 0, to: 49 });
  });

  it.each(["O'Connor", "L'Haÿ-les-Roses", "Jean, Pierre", "André", "Nom (test)"])("quotes special search value %s for PostgREST filters", (value) => {
    const filter = buildInteractionsSearchOrFilter(["title", "summary"], value);

    expect(filter).toContain(`title.ilike."*${value}*"`);
    expect(filter).toContain(`summary.ilike."*${value}*"`);
  });
});

describe("interactions deletion permissions", () => {
  it("allows only owner and admin roles to delete interactions", () => {
    expect(canDeleteInteractions("owner")).toBe(true);
    expect(canDeleteInteractions("admin")).toBe(true);
    expect(canDeleteInteractions("recruiter")).toBe(false);
    expect(canDeleteInteractions("manager")).toBe(false);
    expect(canDeleteInteractions("reader")).toBe(false);
  });
});
