import { describe, expect, it } from "vitest";
import type { PipelineCardModel } from "./pipeline-ui";
import {
  formatPipelineDate,
  groupPipelineCards,
  isOverdue,
  isToday,
  normalizePipelineStage,
  normalizePipelineView,
  ownerLabel,
  PIPELINE_STAGE_LABELS
} from "./pipeline-ui";
import { RECRUITMENT_PIPELINE_STAGES } from "./options";

function card(overrides: Partial<PipelineCardModel> = {}): PipelineCardModel {
  return {
    id: "relationship-a",
    personName: "Florence Martin",
    organizationName: "Atlas QA",
    stage: "qualification",
    ownerUserId: null,
    ownerName: "Sans responsable",
    nextActionAt: null,
    lastInteractionAt: null,
    updatedAt: "2026-07-19T08:00:00Z",
    doNotContact: false,
    rejectionRecontactable: null,
    status: "active",
    href: "/relationships/relationship-a",
    ...overrides
  };
}

describe("pipeline UI helpers", () => {
  it("keeps the thirteen official Sprint 10B columns in order", () => {
    expect(RECRUITMENT_PIPELINE_STAGES).toEqual([
      "detection",
      "qualification",
      "first_contact",
      "conversation",
      "appointment",
      "presentation",
      "reflection",
      "negotiation",
      "signature",
      "onboarding",
      "development",
      "ambassador",
      "rejected"
    ]);
    expect(PIPELINE_STAGE_LABELS.conversation).toBe("Conversation engagée");
    expect(PIPELINE_STAGE_LABELS.appointment).toBe("Rendez-vous obtenu");
    expect(PIPELINE_STAGE_LABELS.presentation).toBe("Présentation réalisée");
    expect(PIPELINE_STAGE_LABELS.rejected).toBe("Refus");
  });

  it("groups cards by pipeline stage without changing card identity", () => {
    const groups = groupPipelineCards([card(), card({ id: "relationship-b", stage: "signature" })]);

    expect(groups).toHaveLength(13);
    expect(groups.find((group) => group.stage === "qualification")?.cards).toHaveLength(1);
    expect(groups.find((group) => group.stage === "signature")?.cards[0].id).toBe("relationship-b");
  });

  it("normalizes public view and stage parameters", () => {
    expect(normalizePipelineView("list")).toBe("list");
    expect(normalizePipelineView("bad")).toBe("kanban");
    expect(normalizePipelineStage("signature")).toBe("signature");
    expect(normalizePipelineStage("kanban")).toBe("");
  });

  it("classifies due dates for dashboard chips", () => {
    const now = new Date("2026-07-19T12:00:00Z");

    expect(isOverdue("2026-07-18T10:00:00Z", now)).toBe(true);
    expect(isToday("2026-07-19T08:00:00Z", now)).toBe(true);
    expect(isToday("2026-07-20T08:00:00Z", now)).toBe(false);
    expect(formatPipelineDate(null)).toBe("Aucune date");
  });

  it("never exposes a UUID as the visible owner fallback", () => {
    const owners = new Map([["11111111-1111-4111-8111-111111111111", "Utilisateur courant"]]);

    expect(ownerLabel(null, owners)).toBe("Sans responsable");
    expect(ownerLabel("11111111-1111-4111-8111-111111111111", owners)).toBe("Utilisateur courant");
    expect(ownerLabel("22222222-2222-4222-8222-222222222222", owners)).toBe("Responsable assigné");
  });
});
