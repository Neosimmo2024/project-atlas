import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PipelineCardModel } from "./pipeline-ui";
import type { TenantContext } from "@/types/domain";

const mocks = vi.hoisted(() => ({
  getTenantContext: vi.fn(),
  listRecruitmentPipeline: vi.fn()
}));

vi.mock("@/repositories/tenant-context", () => ({
  getTenantContext: mocks.getTenantContext
}));

vi.mock("@/repositories/recruitment-pipeline", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/repositories/recruitment-pipeline")>();
  return {
    ...actual,
    listRecruitmentPipeline: mocks.listRecruitmentPipeline
  };
});

const context: TenantContext = {
  tenantId: "tenant-a",
  tenant: { id: "tenant-a", name: "Tenant A" },
  userId: "user-a",
  role: "owner"
};

const card: PipelineCardModel = {
  id: "relationship-a",
  personName: "Renato Ponzio",
  organizationName: "NEOS IMMO",
  stage: "qualification",
  ownerUserId: "user-a",
  ownerName: "Utilisateur courant",
  nextActionAt: null,
  lastInteractionAt: null,
  updatedAt: "2026-07-19T08:00:00Z",
  doNotContact: false,
  rejectionRecontactable: null,
  signatureScheduled: false,
  status: "active",
  href: "/relationships/relationship-a"
};

describe("pipeline API", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getTenantContext.mockResolvedValue(context);
    mocks.listRecruitmentPipeline.mockResolvedValue({
      cards: [card],
      owners: [{ id: "user-a", label: "Utilisateur courant", role: "owner" }],
      total: 1,
      page: 1,
      pageSize: 25,
      pageCount: 1,
      invalidStages: []
    });
  });

  it("lists the authenticated tenant pipeline and ignores browser tenant_id", async () => {
    const { GET } = await import("../../app/api/pipeline/route");

    const response = await GET(new Request("http://localhost/api/pipeline?tenant_id=tenant-b&stage=qualification&view=list"));
    const body = await response.json() as { data: PipelineCardModel[]; pagination: { total: number } };

    expect(response.status).toBe(200);
    expect(body.data).toEqual([card]);
    expect(body.pagination.total).toBe(1);
    expect(mocks.listRecruitmentPipeline).toHaveBeenCalledWith(context, expect.objectContaining({ stage: "qualification", view: "list" }));
    expect(mocks.listRecruitmentPipeline).not.toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-b" }), expect.anything());
  });

  it("returns 401 when there is no tenant context", async () => {
    const { GET } = await import("../../app/api/pipeline/route");
    mocks.getTenantContext.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/pipeline"));
    const body = await response.json() as { error: string };

    expect(response.status).toBe(401);
    expect(body.error).toBe("Tenant context not found");
    expect(mocks.listRecruitmentPipeline).not.toHaveBeenCalled();
  });
});
