import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/types/domain";

const mocks = vi.hoisted(() => {
  const selectMock = vi.fn();
  const updateMock = vi.fn();
  const eqTenantMock = vi.fn();
  const eqIdMock = vi.fn();
  const isMock = vi.fn();
  const maybeSingleMock = vi.fn();
  const readEqTenantMock = vi.fn();
  const readEqIdMock = vi.fn();
  const readIsMock = vi.fn();
  const fromMock = vi.fn();
  const recordTaskDeletedMock = vi.fn();

  return { selectMock, updateMock, eqTenantMock, eqIdMock, isMock, maybeSingleMock, readEqTenantMock, readEqIdMock, readIsMock, fromMock, recordTaskDeletedMock };
});

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({ from: mocks.fromMock }))
}));

vi.mock("@/services/timeline-service", () => ({
  recordTaskChanged: vi.fn(),
  recordTaskDeleted: mocks.recordTaskDeletedMock
}));

const context: TenantContext = {
  tenantId: "tenant-a",
  tenant: { id: "tenant-a", name: "Tenant A" },
  userId: "user-a",
  role: "owner"
};

describe("tasks repository", () => {
  beforeEach(() => {
    mocks.selectMock.mockReset();
    mocks.updateMock.mockReset();
    mocks.eqTenantMock.mockReset();
    mocks.eqIdMock.mockReset();
    mocks.isMock.mockReset();
    mocks.maybeSingleMock.mockReset();
    mocks.readEqTenantMock.mockReset();
    mocks.readEqIdMock.mockReset();
    mocks.readIsMock.mockReset();
    mocks.fromMock.mockReset();
    mocks.recordTaskDeletedMock.mockReset();

    mocks.maybeSingleMock.mockResolvedValue({
      data: {
        id: "task-1",
        tenant_id: "tenant-a",
        title: "Relancer",
        description: null,
        status: "todo",
        priority: "normal",
        due_at: null,
        completed_at: null,
        assigned_to: null,
        created_by: "user-a",
        person_id: null,
        organization_id: null,
        relationship_id: null,
        interaction_id: null,
        source_type: "manual",
        source_id: null,
        reason: null,
        metadata: {},
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        deleted_at: null
      },
      error: null
    });
    mocks.readIsMock.mockReturnValue({ maybeSingle: mocks.maybeSingleMock });
    mocks.readEqIdMock.mockReturnValue({ is: mocks.readIsMock });
    mocks.readEqTenantMock.mockReturnValue({ eq: mocks.readEqIdMock });
    mocks.selectMock.mockReturnValue({ eq: mocks.readEqTenantMock });
    mocks.isMock.mockResolvedValue({ error: null });
    mocks.eqIdMock.mockReturnValue({ is: mocks.isMock });
    mocks.eqTenantMock.mockReturnValue({ eq: mocks.eqIdMock });
    mocks.updateMock.mockReturnValue({ eq: mocks.eqTenantMock });
    mocks.fromMock.mockReturnValue({ select: mocks.selectMock, update: mocks.updateMock });
  });

  it("denies soft delete for non owner/admin roles before touching Supabase", async () => {
    const { deleteTask } = await import("../../repositories/tasks");
    const result = await deleteTask({ ...context, role: "recruiter" }, "task-1");

    expect(result).toEqual({ allowed: false, deleted: false });
    expect(mocks.fromMock).not.toHaveBeenCalled();
  });

  it("soft deletes tasks for owner/admin roles", async () => {
    const { deleteTask } = await import("../../repositories/tasks");
    const result = await deleteTask(context, "task-1");

    expect(result).toEqual({ allowed: true, deleted: true });
    expect(mocks.fromMock).toHaveBeenCalledWith("tasks");
    expect(mocks.updateMock).toHaveBeenCalledWith(expect.objectContaining({ deleted_at: expect.any(String) }));
    expect(mocks.eqTenantMock).toHaveBeenCalledWith("tenant_id", "tenant-a");
    expect(mocks.eqIdMock).toHaveBeenCalledWith("id", "task-1");
    expect(mocks.recordTaskDeletedMock).toHaveBeenCalled();
  });
});
