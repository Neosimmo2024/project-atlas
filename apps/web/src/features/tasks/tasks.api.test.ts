import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task, TenantContext } from "@/types/domain";

const mocks = vi.hoisted(() => ({
  listTasksMock: vi.fn(),
  createTaskMock: vi.fn(),
  updateTaskMock: vi.fn(),
  deleteTaskMock: vi.fn(),
  getTenantContextMock: vi.fn()
}));

vi.mock("@/repositories/tasks", () => ({
  listTasks: mocks.listTasksMock,
  createTask: mocks.createTaskMock,
  updateTask: mocks.updateTaskMock,
  deleteTask: mocks.deleteTaskMock
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

const task: Task = {
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
  source_id: "11111111-1111-4111-8111-111111111111",
  reason: null,
  metadata: {},
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  deleted_at: null
};

function validPayload() {
  return {
    title: task.title,
    status: task.status,
    priority: task.priority,
    source_type: task.source_type,
    source_id: task.source_id
  };
}

describe("tasks API", () => {
  beforeEach(() => {
    mocks.listTasksMock.mockReset();
    mocks.createTaskMock.mockReset();
    mocks.updateTaskMock.mockReset();
    mocks.deleteTaskMock.mockReset();
    mocks.getTenantContextMock.mockReset();
    mocks.getTenantContextMock.mockResolvedValue(context);
  });

  it("returns 401 without tenant context", async () => {
    const { GET } = await import("../../app/api/tasks/route");
    mocks.getTenantContextMock.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/tasks"));

    expect(response.status).toBe(401);
  });

  it("lists tasks with pagination", async () => {
    const { GET } = await import("../../app/api/tasks/route");
    mocks.listTasksMock.mockResolvedValue({ tasks: [task], total: 1, page: 1, pageSize: 10, pageCount: 1 });

    const response = await GET(new Request("http://localhost/api/tasks?query=relancer&due=today"));
    const body = await response.json() as { data: Task[]; pagination: { total: number } };

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.pagination.total).toBe(1);
    expect(mocks.listTasksMock).toHaveBeenCalledWith(context, expect.objectContaining({ query: "relancer", due: "today" }));
  });

  it("validates POST payload", async () => {
    const { POST } = await import("../../app/api/tasks/route");
    const response = await POST(new Request("http://localhost/api/tasks", { method: "POST", body: JSON.stringify({ title: "" }) }));

    expect(response.status).toBe(400);
  });

  it("creates, updates, and deletes tasks", async () => {
    const [{ POST }, { PUT, DELETE }] = await Promise.all([
      import("../../app/api/tasks/route"),
      import("../../app/api/tasks/[id]/route")
    ]);
    mocks.createTaskMock.mockResolvedValue(task);
    mocks.updateTaskMock.mockResolvedValue(task);
    mocks.deleteTaskMock.mockResolvedValue({ allowed: true, deleted: true });

    const created = await POST(new Request("http://localhost/api/tasks", { method: "POST", body: JSON.stringify(validPayload()) }));
    const updated = await PUT(new Request("http://localhost/api/tasks/task-1", { method: "PUT", body: JSON.stringify(validPayload()) }), { params: Promise.resolve({ id: "task-1" }) });
    const deleted = await DELETE(new Request("http://localhost/api/tasks/task-1", { method: "DELETE" }), { params: Promise.resolve({ id: "task-1" }) });

    expect(created.status).toBe(201);
    expect(updated.status).toBe(200);
    expect(deleted.status).toBe(200);
  });

  it("returns 403 when delete is refused by permissions", async () => {
    const { DELETE } = await import("../../app/api/tasks/[id]/route");
    mocks.deleteTaskMock.mockResolvedValue({ allowed: false, deleted: false });

    const response = await DELETE(new Request("http://localhost/api/tasks/task-1", { method: "DELETE" }), { params: Promise.resolve({ id: "task-1" }) });

    expect(response.status).toBe(403);
  });
});
