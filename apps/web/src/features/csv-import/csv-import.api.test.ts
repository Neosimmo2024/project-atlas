import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/types/domain";

const mocks = vi.hoisted(() => ({
  getTenantContextMock: vi.fn(),
  previewTenantCsvImportMock: vi.fn(),
  executeTenantCsvImportMock: vi.fn(),
  listCsvImportHistoryMock: vi.fn(),
  getCsvImportDetailMock: vi.fn(),
  analyzeCsvImportCancellationMock: vi.fn(),
  cancelCsvImportMock: vi.fn()
}));

vi.mock("@/repositories/tenant-context", () => ({
  getTenantContext: mocks.getTenantContextMock
}));

vi.mock("@/repositories/csv-import-preview", () => ({
  previewTenantCsvImport: mocks.previewTenantCsvImportMock
}));

vi.mock("@/repositories/csv-import-execution", () => ({
  executeTenantCsvImport: mocks.executeTenantCsvImportMock
}));

vi.mock("@/repositories/csv-import-history", () => ({
  listCsvImportHistory: mocks.listCsvImportHistoryMock,
  getCsvImportDetail: mocks.getCsvImportDetailMock,
  analyzeCsvImportCancellation: mocks.analyzeCsvImportCancellationMock,
  cancelCsvImport: mocks.cancelCsvImportMock
}));

const context: TenantContext = {
  tenantId: "tenant-a",
  tenant: { id: "tenant-a", name: "Tenant A" },
  userId: "user-a",
  role: "owner"
};

describe("CSV import preview API", () => {
  beforeEach(() => {
    mocks.getTenantContextMock.mockReset();
    mocks.previewTenantCsvImportMock.mockReset();
    mocks.executeTenantCsvImportMock.mockReset();
    mocks.listCsvImportHistoryMock.mockReset();
    mocks.getCsvImportDetailMock.mockReset();
    mocks.analyzeCsvImportCancellationMock.mockReset();
    mocks.cancelCsvImportMock.mockReset();
    mocks.getTenantContextMock.mockResolvedValue(context);
    mocks.previewTenantCsvImportMock.mockResolvedValue({
      headers: ["First", "Email"],
      proposedMapping: { First: "first_name", Email: "email" },
      unmappedHeaders: [],
      rows: [],
      summary: {
        totalRows: 0,
        newContacts: 0,
        existingContactsToEnrich: 0,
        certainDuplicates: 0,
        possibleDuplicates: 0,
        criticalConflicts: 0,
        rejectedRows: 0,
        cleanRows: 0,
        internalDuplicates: 0,
        atlasMatches: 0,
        ambiguousRows: 0,
        pendingDecisions: 0
      },
      analysisFingerprint: "[]"
    });
    mocks.executeTenantCsvImportMock.mockResolvedValue({
      id: "import-1",
      idempotent: false,
      sourceName: "contacts.csv",
      analysisFingerprint: "[]",
      summary: {
        totalRows: 0,
        peopleCreated: 0,
        peopleLinked: 0,
        organizationsCreated: 0,
        organizationsLinked: 0,
        relationshipsCreated: 0,
        relationshipsLinked: 0,
        relationshipsSkipped: 0,
        pipelineIntegrationEnabled: false,
        rowsIgnored: 0,
        rowsReviewLater: 0,
        rowsRejected: 0,
        errorsCount: 0
      },
      rows: [],
      errors: [],
      createdAt: "2026-07-30T12:00:00Z"
    });
    mocks.listCsvImportHistoryMock.mockResolvedValue({ imports: [], total: 0, page: 1, pageSize: 10, pageCount: 1 });
    mocks.getCsvImportDetailMock.mockResolvedValue({ run: { id: "import-1" }, requestedByLabel: "Ada", cancellation: null, eligibility: { status: "cancellable" } });
    mocks.analyzeCsvImportCancellationMock.mockResolvedValue({
      importId: "import-1",
      status: "cancellable",
      traceInsufficient: false,
      people: [],
      organizations: [],
      relationships: [],
      summary: { deletable: 0, kept: 0, peopleCreated: 0, organizationsCreated: 0, relationshipsCreated: 0 },
      cancellation: null
    });
    mocks.cancelCsvImportMock.mockResolvedValue({
      id: "cancel-1",
      importId: "import-1",
      idempotent: false,
      status: "none",
      summary: { peopleDeleted: 0, peopleKept: 0, organizationsDeleted: 0, organizationsKept: 0, relationshipsDeleted: 0, relationshipsKept: 0 },
      peopleDeleted: [],
      peopleKept: [],
      organizationsDeleted: [],
      organizationsKept: [],
      relationshipsDeleted: [],
      relationshipsKept: [],
      executedAt: "2026-07-30T12:00:00Z"
    });
  });

  it("previews CSV data using the authenticated tenant context", async () => {
    const { POST } = await import("../../app/api/imports/csv/preview/route");

    const response = await POST(new Request("http://localhost/api/imports/csv/preview", {
      method: "POST",
      body: JSON.stringify({ content: "Email\na@example.test", tenant_id: "malicious" })
    }));

    expect(response.status).toBe(200);
    expect(mocks.previewTenantCsvImportMock).toHaveBeenCalledWith(context, {
      content: "Email\na@example.test"
    });
  });

  it("rejects unauthenticated previews", async () => {
    const { POST } = await import("../../app/api/imports/csv/preview/route");
    mocks.getTenantContextMock.mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api/imports/csv/preview", {
      method: "POST",
      body: JSON.stringify({ content: "Email\na@example.test" })
    }));

    expect(response.status).toBe(401);
    expect(mocks.previewTenantCsvImportMock).not.toHaveBeenCalled();
  });

  it("executes CSV imports only after recomputing the preview from tenant context", async () => {
    const { POST } = await import("../../app/api/imports/csv/execute/route");

    const response = await POST(new Request("http://localhost/api/imports/csv/execute", {
      method: "POST",
      body: JSON.stringify({
        content: "First,Email\nAda,a@example.test",
        mapping: { First: "first_name", Email: "email" },
        decisions: [{ lineNumber: 2, decision: "create_new" }],
        analysisFingerprint: "[]",
        idempotencyKey: "request-1",
        sourceName: "contacts.csv",
        addToPipeline: true,
        confirm: true,
        tenant_id: "malicious"
      })
    }));

    expect(response.status).toBe(200);
    expect(mocks.previewTenantCsvImportMock).toHaveBeenCalledWith(context, {
      content: "First,Email\nAda,a@example.test",
      mapping: { First: "first_name", Email: "email" }
    });
    expect(mocks.executeTenantCsvImportMock).toHaveBeenCalledWith(context, expect.objectContaining({
      analysisFingerprint: "[]",
      idempotencyKey: "request-1",
      sourceName: "contacts.csv",
      addToPipeline: true
    }));
  });

  it("rejects execution when explicit confirmation is missing", async () => {
    const { POST } = await import("../../app/api/imports/csv/execute/route");

    const response = await POST(new Request("http://localhost/api/imports/csv/execute", {
      method: "POST",
      body: JSON.stringify({
        content: "First,Email\nAda,a@example.test",
        mapping: { First: "first_name", Email: "email" },
        decisions: [{ lineNumber: 2, decision: "create_new" }],
        analysisFingerprint: "[]",
        idempotencyKey: "request-1",
        confirm: false
      })
    }));

    expect(response.status).toBe(400);
    expect(mocks.executeTenantCsvImportMock).not.toHaveBeenCalled();
  });

  it("rejects readers before executing a final import", async () => {
    const { POST } = await import("../../app/api/imports/csv/execute/route");
    mocks.getTenantContextMock.mockResolvedValue({ ...context, role: "reader" });

    const response = await POST(new Request("http://localhost/api/imports/csv/execute", {
      method: "POST",
      body: JSON.stringify({
        content: "First,Email\nAda,a@example.test",
        mapping: { First: "first_name", Email: "email" },
        decisions: [{ lineNumber: 2, decision: "create_new" }],
        analysisFingerprint: "[]",
        idempotencyKey: "request-1",
        confirm: true
      })
    }));

    expect(response.status).toBe(403);
    expect(mocks.previewTenantCsvImportMock).not.toHaveBeenCalled();
    expect(mocks.executeTenantCsvImportMock).not.toHaveBeenCalled();
  });

  it("lists import history using the authenticated tenant context", async () => {
    const { GET } = await import("../../app/api/imports/route");

    const response = await GET(new Request("http://localhost/api/imports?page=2&pageSize=5"));

    expect(response.status).toBe(200);
    expect(mocks.listCsvImportHistoryMock).toHaveBeenCalledWith(context, { page: 2, pageSize: 5 });
  });

  it("loads import details only from the authenticated tenant context", async () => {
    const { GET } = await import("../../app/api/imports/[id]/route");

    const response = await GET(new Request("http://localhost/api/imports/import-1"), {
      params: Promise.resolve({ id: "import-1" })
    });

    expect(response.status).toBe(200);
    expect(mocks.getCsvImportDetailMock).toHaveBeenCalledWith(context, "import-1");
  });

  it("requires owner or admin before analyzing cancellation eligibility", async () => {
    const { GET } = await import("../../app/api/imports/[id]/cancellation/route");
    mocks.getTenantContextMock.mockResolvedValue({ ...context, role: "reader" });

    const response = await GET(new Request("http://localhost/api/imports/import-1/cancellation"), {
      params: Promise.resolve({ id: "import-1" })
    });

    expect(response.status).toBe(403);
    expect(mocks.analyzeCsvImportCancellationMock).not.toHaveBeenCalled();
  });

  it("executes cancellation with server tenant context and an idempotency key", async () => {
    const { POST } = await import("../../app/api/imports/[id]/cancellation/route");

    const response = await POST(new Request("http://localhost/api/imports/import-1/cancellation", {
      method: "POST",
      body: JSON.stringify({ confirm: true, idempotencyKey: "cancel-request-1", personIds: ["malicious"] })
    }), {
      params: Promise.resolve({ id: "import-1" })
    });

    expect(response.status).toBe(200);
    expect(mocks.cancelCsvImportMock).toHaveBeenCalledWith(context, "import-1", "cancel-request-1");
  });

  it("rejects cancellation without explicit confirmation", async () => {
    const { POST } = await import("../../app/api/imports/[id]/cancellation/route");

    const response = await POST(new Request("http://localhost/api/imports/import-1/cancellation", {
      method: "POST",
      body: JSON.stringify({ confirm: false, idempotencyKey: "cancel-request-1" })
    }), {
      params: Promise.resolve({ id: "import-1" })
    });

    expect(response.status).toBe(400);
    expect(mocks.cancelCsvImportMock).not.toHaveBeenCalled();
  });
});
