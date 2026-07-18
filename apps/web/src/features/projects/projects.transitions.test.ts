import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, TenantContext } from "@/types/domain";

const timelineMocks = vi.hoisted(() => ({
  recordProjectArchived: vi.fn(),
  recordProjectCreated: vi.fn(),
  recordProjectLost: vi.fn(),
  recordProjectReactivated: vi.fn(),
  recordProjectReopened: vi.fn(),
  recordProjectUpdated: vi.fn(),
  recordProjectWon: vi.fn()
}));

const supabaseMock = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: supabaseMock.createSupabaseServerClient
}));

vi.mock("@/services/timeline-service", () => timelineMocks);

type TableName = "projects" | "tenant_users";
type TableRow = Project | { id: string; tenant_id: string; user_id: string; status: string };
type Tables = Record<TableName, TableRow[]>;

const context: TenantContext = {
  tenantId: "tenant-a",
  tenant: { id: "tenant-a", name: "Tenant A" },
  userId: "user-a",
  role: "owner"
};

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    tenant_id: "tenant-a",
    title: "Projet test",
    short_description: "Description conservee",
    project_type: "recruitment",
    status: "open",
    stage: "new",
    owner_user_id: "user-a",
    created_by: "user-a",
    organization_id: null,
    person_id: null,
    relationship_id: null,
    estimated_value: "1000.00",
    final_value: null,
    currency: "EUR",
    expected_close_at: "2026-08-01T00:00:00Z",
    won_at: null,
    lost_at: null,
    loss_reason: null,
    closing_note: null,
    archived_at: null,
    metadata: { source: "test" },
    created_at: "2026-07-18T08:00:00Z",
    updated_at: "2026-07-18T08:00:00Z",
    ...overrides
  };
}

function matches(row: TableRow, filters: Record<string, unknown>) {
  return Object.entries(filters).every(([key, value]) => row[key as keyof TableRow] === value);
}

class QueryBuilder {
  private filters: Record<string, unknown> = {};
  private values: Partial<Project> | null = null;

  constructor(private tables: Tables, private table: TableName) {}

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters[column] = value;
    return this;
  }

  update(values: Partial<Project>) {
    this.values = values;
    return this;
  }

  async maybeSingle() {
    const row = this.tables[this.table].find((candidate) => matches(candidate, this.filters)) ?? null;
    return { data: row, error: null };
  }

  async single() {
    const index = this.tables[this.table].findIndex((candidate) => matches(candidate, this.filters));
    if (index < 0) return { data: null, error: { message: "No rows returned" } };
    const current = this.tables[this.table][index];
    const next = this.values ? { ...current, ...this.values, updated_at: "2026-07-18T09:00:00Z" } as TableRow : current;
    this.tables[this.table][index] = next;
    return { data: next, error: null };
  }
}

function installSupabase(tables: Tables) {
  supabaseMock.createSupabaseServerClient.mockResolvedValue({
    from: (table: TableName) => new QueryBuilder(tables, table)
  });
}

async function expectConflict(action: Promise<unknown>, message: string) {
  await expect(action).rejects.toMatchObject({ status: 409, message });
}

describe("projects repository patch and transitions", () => {
  beforeEach(() => {
    Object.values(timelineMocks).forEach((mock) => mock.mockReset());
    supabaseMock.createSupabaseServerClient.mockReset();
  });

  it("patches a single title without deleting absent fields", async () => {
    const tables: Tables = {
      projects: [project()],
      tenant_users: [{ id: "tenant-user-a", tenant_id: "tenant-a", user_id: "user-a", status: "active" }]
    };
    installSupabase(tables);
    const { patchProject } = await import("@/repositories/projects");

    const updated = await patchProject(context, "11111111-1111-4111-8111-111111111111", { title: "Nouveau titre" });

    expect(updated.title).toBe("Nouveau titre");
    expect(updated.short_description).toBe("Description conservee");
    expect(updated.project_type).toBe("recruitment");
    expect(updated.stage).toBe("new");
  });

  it("patches only stage, owner, and explicit null values", async () => {
    const tables: Tables = {
      projects: [project()],
      tenant_users: [{ id: "tenant-user-b", tenant_id: "tenant-a", user_id: "user-b", status: "active" }]
    };
    installSupabase(tables);
    const { patchProject } = await import("@/repositories/projects");

    const updated = await patchProject(context, "11111111-1111-4111-8111-111111111111", {
      stage: "proposal",
      owner_user_id: "user-b",
      short_description: null,
      expected_close_at: null
    });

    expect(updated.stage).toBe("proposal");
    expect(updated.owner_user_id).toBe("user-b");
    expect(updated.short_description).toBeNull();
    expect(updated.expected_close_at).toBeNull();
    expect(updated.title).toBe("Projet test");
  });

  it("refuses cross-tenant transition targets as not found", async () => {
    const tables: Tables = {
      projects: [project({ tenant_id: "tenant-b" })],
      tenant_users: []
    };
    installSupabase(tables);
    const { archiveProject, loseProject, reactivateProject, reopenProject, winProject } = await import("@/repositories/projects");

    await expect(winProject(context, "11111111-1111-4111-8111-111111111111", { finalValue: "1200.00" })).rejects.toMatchObject({ status: 404 });
    await expect(loseProject(context, "11111111-1111-4111-8111-111111111111", { lossReason: "price" })).rejects.toMatchObject({ status: 404 });
    await expect(reopenProject(context, "11111111-1111-4111-8111-111111111111")).rejects.toMatchObject({ status: 404 });
    await expect(archiveProject(context, "11111111-1111-4111-8111-111111111111", {})).rejects.toMatchObject({ status: 404 });
    await expect(reactivateProject(context, "11111111-1111-4111-8111-111111111111")).rejects.toMatchObject({ status: 404 });
  });

  it("creates exactly one timeline event for valid transitions and none for refused transitions", async () => {
    const tables: Tables = {
      projects: [project()],
      tenant_users: []
    };
    installSupabase(tables);
    const { loseProject, reopenProject, winProject } = await import("@/repositories/projects");

    await winProject(context, "11111111-1111-4111-8111-111111111111", { finalValue: "1200.00" });
    expect(timelineMocks.recordProjectWon).toHaveBeenCalledTimes(1);
    await expectConflict(winProject(context, "11111111-1111-4111-8111-111111111111", { finalValue: "1300.00" }), "Ce Projet est deja gagne.");
    await expectConflict(loseProject(context, "11111111-1111-4111-8111-111111111111", { lossReason: "price" }), "Ce Projet doit etre rouvert avant de pouvoir etre marque comme perdu.");
    expect(timelineMocks.recordProjectWon).toHaveBeenCalledTimes(1);
    expect(timelineMocks.recordProjectLost).not.toHaveBeenCalled();

    await reopenProject(context, "11111111-1111-4111-8111-111111111111");
    expect(timelineMocks.recordProjectReopened).toHaveBeenCalledTimes(1);
    await expectConflict(reopenProject(context, "11111111-1111-4111-8111-111111111111"), "Ce Projet est deja ouvert.");
    expect(timelineMocks.recordProjectReopened).toHaveBeenCalledTimes(1);
  });

  it("refuses double lose, winning a lost project, double archive, and reactivating an active project", async () => {
    const tables: Tables = {
      projects: [project()],
      tenant_users: []
    };
    installSupabase(tables);
    const { archiveProject, loseProject, reactivateProject, winProject } = await import("@/repositories/projects");

    await loseProject(context, "11111111-1111-4111-8111-111111111111", { lossReason: "price" });
    expect(timelineMocks.recordProjectLost).toHaveBeenCalledTimes(1);
    await expectConflict(loseProject(context, "11111111-1111-4111-8111-111111111111", { lossReason: "price" }), "Ce Projet est deja perdu.");
    await expectConflict(winProject(context, "11111111-1111-4111-8111-111111111111", { finalValue: "1200.00" }), "Ce Projet doit etre rouvert avant de pouvoir etre marque comme gagne.");
    expect(timelineMocks.recordProjectLost).toHaveBeenCalledTimes(1);
    expect(timelineMocks.recordProjectWon).not.toHaveBeenCalled();

    tables.projects[0] = project();
    await expectConflict(reactivateProject(context, "11111111-1111-4111-8111-111111111111"), "Ce Projet n'est pas archive.");
    await archiveProject(context, "11111111-1111-4111-8111-111111111111", {});
    expect(timelineMocks.recordProjectArchived).toHaveBeenCalledTimes(1);
    await expectConflict(archiveProject(context, "11111111-1111-4111-8111-111111111111", {}), "Ce Projet est deja archive.");
    expect(timelineMocks.recordProjectArchived).toHaveBeenCalledTimes(1);
  });
});
