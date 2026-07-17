import { describe, expect, it } from "vitest";
import type { Task } from "@/types/domain";
import { buildTasksSearchOrFilter, canDeleteTasks, canWriteTasks, normalizeTasksListParams, taskMatchesSearch } from "./search";
import { parseTaskInput } from "./validation";

const baseTask: Task = {
  id: "task-1",
  tenant_id: "tenant-a",
  title: "Relancer Andre",
  description: "Preparer un appel",
  status: "todo",
  priority: "high",
  due_at: "2026-01-01T10:00:00Z",
  completed_at: null,
  assigned_to: null,
  created_by: "user-a",
  person_id: "11111111-1111-4111-8111-111111111111",
  organization_id: null,
  relationship_id: null,
  interaction_id: null,
  source_type: "person",
  source_id: "11111111-1111-4111-8111-111111111111",
  reason: "Suite qualification",
  metadata: { source: "manual" },
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  deleted_at: null
};

describe("tasks validation", () => {
  it("requires a title and validates options", () => {
    const result = parseTaskInput({ title: "", status: "invalid", priority: "urgent" });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain("Le titre est obligatoire.");
    expect(result.error?.issues.map((issue) => issue.message)).toContain("Le statut est invalide.");
    expect(result.error?.issues.map((issue) => issue.message)).toContain("La priorite est invalide.");
  });

  it("normalizes nullable fields and metadata", () => {
    const result = parseTaskInput({
      title: "Relancer",
      description: "",
      status: "todo",
      priority: "normal",
      due_at: "",
      source_type: "manual",
      source_id: "11111111-1111-4111-8111-111111111111",
      metadata: "{\"channel\":\"manual\"}"
    });

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("Expected task payload to be valid.");
    expect(result.data.description).toBeNull();
    expect(result.data.due_at).toBeNull();
    expect(result.data.metadata).toEqual({ channel: "manual" });
  });

  it("requires source type and source id together", () => {
    const result = parseTaskInput({ title: "Relancer", source_type: "person" });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain("Le type et l'identifiant de source doivent etre renseignes ensemble.");
  });
});

describe("tasks search and filters", () => {
  it("matches task text fields", () => {
    expect(taskMatchesSearch(baseTask, "andre")).toBe(true);
    expect(taskMatchesSearch(baseTask, "qualification")).toBe(true);
    expect(taskMatchesSearch(baseTask, "absent")).toBe(false);
  });

  it("normalizes pagination and filter bounds", () => {
    expect(normalizeTasksListParams({ page: -2, pageSize: 200, due: "today" })).toMatchObject({ page: 1, pageSize: 50, due: "today", from: 0, to: 49 });
  });

  it.each(["O'Connor", "L'Hay-les-Roses", "Jean, Pierre", "Andre", "Nom (test)"])("quotes special search value %s for PostgREST filters", (value) => {
    const filter = buildTasksSearchOrFilter(["title", "description"], value);

    expect(filter).toContain(`title.ilike."*${value}*"`);
    expect(filter).toContain(`description.ilike."*${value}*"`);
  });
});

describe("tasks permissions", () => {
  it("allows owner/admin to delete and recruiting roles to write", () => {
    expect(canDeleteTasks("owner")).toBe(true);
    expect(canDeleteTasks("admin")).toBe(true);
    expect(canDeleteTasks("recruiter")).toBe(false);
    expect(canDeleteTasks("manager")).toBe(false);
    expect(canDeleteTasks("reader")).toBe(false);

    expect(canWriteTasks("owner")).toBe(true);
    expect(canWriteTasks("admin")).toBe(true);
    expect(canWriteTasks("recruiter")).toBe(true);
    expect(canWriteTasks("manager")).toBe(true);
    expect(canWriteTasks("reader")).toBe(false);
  });
});
