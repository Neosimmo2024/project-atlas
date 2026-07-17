import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/types/domain";

const mocks = vi.hoisted(() => ({
  deletePersonMock: vi.fn(),
  getTenantContextMock: vi.fn()
}));

vi.mock("@/repositories/people", () => ({
  deletePerson: mocks.deletePersonMock,
  findPotentialPersonDuplicates: vi.fn(),
  getPersonDetail: vi.fn(),
  updatePerson: vi.fn()
}));

vi.mock("@/repositories/tenant-context", () => ({
  getTenantContext: mocks.getTenantContextMock
}));

const context: TenantContext = {
  tenantId: "tenant-a",
  tenant: { id: "tenant-a", name: "Tenant A" },
  userId: "user-a",
  role: "owner"
};

describe("people API deletion", () => {
  beforeEach(() => {
    mocks.deletePersonMock.mockReset();
    mocks.getTenantContextMock.mockReset();
    mocks.getTenantContextMock.mockResolvedValue(context);
  });

  it("returns explicit JSON after deleting a person", async () => {
    const { DELETE } = await import("../../app/api/people/[id]/route");
    mocks.deletePersonMock.mockResolvedValue({ allowed: true, deleted: true });

    const response = await DELETE(new Request("http://localhost/api/people/person-1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "person-1" })
    });
    const body = await response.json() as { deleted: boolean };

    expect(response.status).toBe(200);
    expect(body.deleted).toBe(true);
  });

  it("returns explicit JSON when deletion is forbidden", async () => {
    const { DELETE } = await import("../../app/api/people/[id]/route");
    mocks.deletePersonMock.mockResolvedValue({ allowed: false, deleted: false });

    const response = await DELETE(new Request("http://localhost/api/people/person-1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "person-1" })
    });
    const body = await response.json() as { error: string };

    expect(response.status).toBe(403);
    expect(body.error).toBe("Only owner and admin roles can delete people.");
  });

  it("returns explicit JSON when Supabase rejects deletion", async () => {
    const { DELETE } = await import("../../app/api/people/[id]/route");
    mocks.deletePersonMock.mockRejectedValue(new Error("Suppression refusee par une dependance."));

    const response = await DELETE(new Request("http://localhost/api/people/person-1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "person-1" })
    });
    const body = await response.json() as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("Suppression refusee par une dependance.");
  });
});
