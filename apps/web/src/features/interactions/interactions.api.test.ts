import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Interaction, TenantContext } from "@/types/domain";

const mocks = vi.hoisted(() => ({
  listInteractionsMock: vi.fn(),
  createInteractionMock: vi.fn(),
  updateInteractionMock: vi.fn(),
  deleteInteractionMock: vi.fn(),
  getTenantContextMock: vi.fn()
}));

vi.mock("@/repositories/interactions", () => ({
  listInteractions: mocks.listInteractionsMock,
  createInteraction: mocks.createInteractionMock,
  updateInteraction: mocks.updateInteractionMock,
  deleteInteraction: mocks.deleteInteractionMock
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

const interaction: Interaction = {
  id: "interaction-1",
  tenant_id: "tenant-a",
  person_id: "11111111-1111-4111-8111-111111111111",
  organization_id: null,
  relationship_id: null,
  type_id: "22222222-2222-4222-8222-222222222222",
  title: "Appel",
  summary: null,
  interaction_date: "2026-01-01T10:00:00Z",
  duration_minutes: null,
  location: null,
  created_by: "user-a",
  change_reason: null,
  main_obstacle: null,
  timing: null,
  dna_compatibility: null,
  work_with_person_desire: null,
  comments: null,
  metadata: {},
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  deleted_at: null
};

function validPayload() {
  return {
    person_id: interaction.person_id,
    type_id: interaction.type_id,
    title: interaction.title,
    interaction_date: interaction.interaction_date
  };
}

describe("interactions API", () => {
  beforeEach(() => {
    mocks.listInteractionsMock.mockReset();
    mocks.createInteractionMock.mockReset();
    mocks.updateInteractionMock.mockReset();
    mocks.deleteInteractionMock.mockReset();
    mocks.getTenantContextMock.mockReset();
    mocks.getTenantContextMock.mockResolvedValue(context);
  });

  it("returns 401 without tenant context", async () => {
    const { GET } = await import("../../app/api/interactions/route");
    mocks.getTenantContextMock.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/interactions"));

    expect(response.status).toBe(401);
  });

  it("lists interactions with pagination", async () => {
    const { GET } = await import("../../app/api/interactions/route");
    mocks.listInteractionsMock.mockResolvedValue({ interactions: [interaction], total: 1, page: 1, pageSize: 10, pageCount: 1 });

    const response = await GET(new Request("http://localhost/api/interactions?query=appel"));
    const body = await response.json() as { data: Interaction[]; pagination: { total: number } };

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.pagination.total).toBe(1);
  });

  it("validates POST payload", async () => {
    const { POST } = await import("../../app/api/interactions/route");
    const response = await POST(new Request("http://localhost/api/interactions", {
      method: "POST",
      body: JSON.stringify({ title: "" })
    }));

    expect(response.status).toBe(400);
  });

  it("creates, updates, and deletes interactions", async () => {
    const [{ POST }, { PUT, DELETE }] = await Promise.all([
      import("../../app/api/interactions/route"),
      import("../../app/api/interactions/[id]/route")
    ]);
    mocks.createInteractionMock.mockResolvedValue(interaction);
    mocks.updateInteractionMock.mockResolvedValue(interaction);
    mocks.deleteInteractionMock.mockResolvedValue({ allowed: true, deleted: true });

    const created = await POST(new Request("http://localhost/api/interactions", { method: "POST", body: JSON.stringify(validPayload()) }));
    const updated = await PUT(new Request("http://localhost/api/interactions/interaction-1", { method: "PUT", body: JSON.stringify(validPayload()) }), { params: Promise.resolve({ id: "interaction-1" }) });
    const deleted = await DELETE(new Request("http://localhost/api/interactions/interaction-1", { method: "DELETE" }), { params: Promise.resolve({ id: "interaction-1" }) });

    expect(created.status).toBe(201);
    expect(updated.status).toBe(200);
    expect(deleted.status).toBe(200);
  });
});
