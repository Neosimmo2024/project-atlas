import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-errors";
import type { Project, TenantContext } from "@/types/domain";

const mocks = vi.hoisted(() => ({
  archiveProjectMock: vi.fn(),
  createProjectMock: vi.fn(),
  getProjectDetailMock: vi.fn(),
  getTenantContextMock: vi.fn(),
  listProjectsMock: vi.fn(),
  loseProjectMock: vi.fn(),
  patchProjectMock: vi.fn(),
  reactivateProjectMock: vi.fn(),
  reopenProjectMock: vi.fn(),
  winProjectMock: vi.fn()
}));

vi.mock("@/repositories/projects", () => ({
  archiveProject: mocks.archiveProjectMock,
  createProject: mocks.createProjectMock,
  getProjectDetail: mocks.getProjectDetailMock,
  listProjects: mocks.listProjectsMock,
  loseProject: mocks.loseProjectMock,
  patchProject: mocks.patchProjectMock,
  reactivateProject: mocks.reactivateProjectMock,
  reopenProject: mocks.reopenProjectMock,
  winProject: mocks.winProjectMock
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

const project: Project = {
  id: "11111111-1111-4111-8111-111111111111",
  tenant_id: "tenant-a",
  title: "Projet test",
  short_description: null,
  project_type: "recruitment",
  status: "open",
  stage: "qualification",
  owner_user_id: "user-a",
  created_by: "user-a",
  organization_id: null,
  person_id: null,
  relationship_id: null,
  estimated_value: null,
  final_value: null,
  currency: "EUR",
  expected_close_at: null,
  won_at: null,
  lost_at: null,
  loss_reason: null,
  closing_note: null,
  archived_at: null,
  metadata: {},
  created_at: "2026-07-18T08:00:00Z",
  updated_at: "2026-07-18T08:00:00Z"
};

describe("projects API", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getTenantContextMock.mockResolvedValue(context);
  });

  it("lists projects with deterministic pagination metadata", async () => {
    const { GET } = await import("../../app/api/projects/route");
    mocks.listProjectsMock.mockResolvedValue({ projects: [project], total: 1, page: 1, pageSize: 10, pageCount: 1 });

    const response = await GET(new Request("http://localhost/api/projects?status=open&includeArchived=true"));
    const body = await response.json() as { data: Project[]; pagination: { total: number } };

    expect(response.status).toBe(200);
    expect(body.data).toEqual([project]);
    expect(body.pagination.total).toBe(1);
    expect(mocks.listProjectsMock).toHaveBeenCalledWith(context, expect.objectContaining({ status: "open", includeArchived: "true" }));
  });

  it("creates a project using the authenticated context", async () => {
    const { POST } = await import("../../app/api/projects/route");
    mocks.createProjectMock.mockResolvedValue(project);

    const response = await POST(new Request("http://localhost/api/projects", {
      method: "POST",
      body: JSON.stringify({ title: "Projet test", project_type: "recruitment", status: "open", stage: "qualification", tenant_id: "malicious" })
    }));

    expect(response.status).toBe(201);
    expect(mocks.createProjectMock).toHaveBeenCalledWith(context, expect.not.objectContaining({ tenant_id: expect.anything() }));
  });

  it("gets and patches project detail with a single partial field", async () => {
    const route = await import("../../app/api/projects/[id]/route");
    mocks.getProjectDetailMock.mockResolvedValue({ project, person: null, organization: null, relationship: null, nextAction: null, lastActivityAt: project.created_at });
    mocks.patchProjectMock.mockResolvedValue({ ...project, stage: "proposal" });

    const getResponse = await route.GET(new Request("http://localhost/api/projects/11111111-1111-4111-8111-111111111111"), { params: Promise.resolve({ id: project.id }) });
    const patchResponse = await route.PATCH(new Request("http://localhost/api/projects/11111111-1111-4111-8111-111111111111", {
      method: "PATCH",
      body: JSON.stringify({ stage: "proposal" })
    }), { params: Promise.resolve({ id: project.id }) });

    expect(getResponse.status).toBe(200);
    expect(patchResponse.status).toBe(200);
    expect(mocks.patchProjectMock).toHaveBeenCalledWith(context, project.id, expect.objectContaining({ stage: "proposal" }));
  });

  it("rejects empty patches and transition fields in PATCH", async () => {
    const route = await import("../../app/api/projects/[id]/route");

    const emptyResponse = await route.PATCH(new Request("http://localhost/api/projects/11111111-1111-4111-8111-111111111111", {
      method: "PATCH",
      body: JSON.stringify({})
    }), { params: Promise.resolve({ id: project.id }) });
    const forbiddenResponse = await route.PATCH(new Request("http://localhost/api/projects/11111111-1111-4111-8111-111111111111", {
      method: "PATCH",
      body: JSON.stringify({ status: "won", final_value: "12000.00", won_at: "2026-07-18T08:00:00Z", lost_at: null, loss_reason: null, archived_at: null, closing_note: "Note interdite" })
    }), { params: Promise.resolve({ id: project.id }) });

    expect(emptyResponse.status).toBe(400);
    expect(forbiddenResponse.status).toBe(400);
    expect(mocks.patchProjectMock).not.toHaveBeenCalled();
  });

  it("returns 409 for business transition conflicts", async () => {
    const win = await import("../../app/api/projects/[id]/win/route");
    mocks.winProjectMock.mockRejectedValue(new ApiError("Ce Projet est deja gagne.", 409, "PROJECT_TRANSITION_CONFLICT"));

    const response = await win.POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ finalValue: "12000.00" }) }), { params: Promise.resolve({ id: project.id }) });
    const body = await response.json() as { error: string; code: string };

    expect(response.status).toBe(409);
    expect(body).toEqual({ error: "Ce Projet est deja gagne.", code: "PROJECT_TRANSITION_CONFLICT" });
  });

  it("runs win, lose, reopen, archive, and reactivate transitions", async () => {
    const win = await import("../../app/api/projects/[id]/win/route");
    const lose = await import("../../app/api/projects/[id]/lose/route");
    const reopen = await import("../../app/api/projects/[id]/reopen/route");
    const archive = await import("../../app/api/projects/[id]/archive/route");
    const reactivate = await import("../../app/api/projects/[id]/reactivate/route");
    mocks.winProjectMock.mockResolvedValue({ ...project, status: "won" });
    mocks.loseProjectMock.mockResolvedValue({ ...project, status: "lost" });
    mocks.reopenProjectMock.mockResolvedValue(project);
    mocks.archiveProjectMock.mockResolvedValue({ ...project, archived_at: "2026-07-18T08:00:00Z" });
    mocks.reactivateProjectMock.mockResolvedValue(project);

    expect((await win.POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ finalValue: "12000.00" }) }), { params: Promise.resolve({ id: project.id }) })).status).toBe(200);
    expect((await lose.POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ lossReason: "price" }) }), { params: Promise.resolve({ id: project.id }) })).status).toBe(200);
    expect((await reopen.POST(new Request("http://localhost", { method: "POST" }), { params: Promise.resolve({ id: project.id }) })).status).toBe(200);
    expect((await archive.POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({}) }), { params: Promise.resolve({ id: project.id }) })).status).toBe(200);
    expect((await reactivate.POST(new Request("http://localhost", { method: "POST" }), { params: Promise.resolve({ id: project.id }) })).status).toBe(200);
  });
});
