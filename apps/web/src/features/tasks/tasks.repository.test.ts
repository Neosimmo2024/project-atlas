import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/types/domain";

const mocks = vi.hoisted(() => {
  const updateMock = vi.fn();
  const eqTenantMock = vi.fn();
  const eqIdMock = vi.fn();
  const isMock = vi.fn();
  const fromMock = vi.fn();

  return { updateMock, eqTenantMock, eqIdMock, isMock, fromMock };
});

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({ from: mocks.fromMock }))
}));

const context: TenantContext = {
  tenantId: "tenant-a",
  tenant: { id: "tenant-a", name: "Tenant A" },
  userId: "user-a",
  role: "owner"
};

describe("tasks repository", () => {
  beforeEach(() => {
    mocks.updateMock.mockReset();
    mocks.eqTenantMock.mockReset();
    mocks.eqIdMock.mockReset();
    mocks.isMock.mockReset();
    mocks.fromMock.mockReset();

    mocks.isMock.mockResolvedValue({ error: null });
    mocks.eqIdMock.mockReturnValue({ is: mocks.isMock });
    mocks.eqTenantMock.mockReturnValue({ eq: mocks.eqIdMock });
    mocks.updateMock.mockReturnValue({ eq: mocks.eqTenantMock });
    mocks.fromMock.mockReturnValue({ update: mocks.updateMock });
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
  });
});
