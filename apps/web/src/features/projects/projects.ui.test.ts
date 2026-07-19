import { describe, expect, it } from "vitest";
import { formatMoney, projectSignals, projectStageLabel, projectStatusLabel, projectTypeLabel } from "@/components/projects/project-utils";
import { taskInputSchema } from "@/features/tasks/validation";
import { interactionInputSchema } from "@/features/interactions/validation";
import type { Project } from "@/types/domain";

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    tenant_id: "tenant-a",
    title: "Projet Renato",
    short_description: "Description",
    project_type: "recruitment",
    status: "open",
    stage: "qualification",
    owner_user_id: "user-a",
    created_by: "user-a",
    organization_id: "org-a",
    person_id: "person-a",
    relationship_id: "relationship-a",
    estimated_value: "12000.00",
    final_value: null,
    currency: "EUR",
    expected_close_at: "2026-07-25T00:00:00Z",
    won_at: null,
    lost_at: null,
    loss_reason: null,
    closing_note: null,
    archived_at: null,
    metadata: {},
    created_at: "2026-07-18T08:00:00Z",
    updated_at: "2026-07-18T09:00:00Z",
    ...overrides
  };
}

describe("projects UI helpers", () => {
  it("formats labels used by project cards and detail pages", () => {
    expect(projectTypeLabel("recruitment")).toBe("Recrutement");
    expect(projectStatusLabel("open")).toBe("Ouvert");
    expect(projectStageLabel("qualification")).toBe("Qualification");
    expect(formatMoney("12000.00", "EUR")).toBe("12000.00 EUR");
  });

  it("returns textual signals without relying only on color", () => {
    expect(projectSignals(project(), true, "overdue")).toEqual(expect.arrayContaining(["Action en retard", "Cloture prevue prochainement"]));
    expect(projectSignals(project({ archived_at: "2026-07-18T08:00:00Z" }), false)).toEqual(expect.arrayContaining(["Projet archive", "Aucune action planifiee"]));
    expect(projectSignals(project({ status: "won", won_at: "2026-07-18T08:00:00Z" }), true)).toEqual(expect.arrayContaining(["Projet gagne"]));
    expect(projectSignals(project({ status: "lost", lost_at: "2026-07-18T08:00:00Z" }), true)).toEqual(expect.arrayContaining(["Projet perdu"]));
  });

  it("validates project-linked task and interaction payloads", () => {
    expect(taskInputSchema.safeParse({
      title: "Tache Projet",
      status: "todo",
      priority: "normal",
      project_id: "11111111-1111-4111-8111-111111111111",
      source_type: "project",
      source_id: "11111111-1111-4111-8111-111111111111"
    }).success).toBe(true);

    expect(interactionInputSchema.safeParse({
      title: "Echange Projet",
      type_id: "22222222-2222-4222-8222-222222222222",
      interaction_date: "2026-07-18T08:00:00Z",
      project_id: "11111111-1111-4111-8111-111111111111"
    }).success).toBe(true);
  });
});
