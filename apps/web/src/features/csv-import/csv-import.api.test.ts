import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/types/domain";

const mocks = vi.hoisted(() => ({
  getTenantContextMock: vi.fn(),
  previewTenantCsvImportMock: vi.fn()
}));

vi.mock("@/repositories/tenant-context", () => ({
  getTenantContext: mocks.getTenantContextMock
}));

vi.mock("@/repositories/csv-import-preview", () => ({
  previewTenantCsvImport: mocks.previewTenantCsvImportMock
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
    mocks.getTenantContextMock.mockResolvedValue(context);
    mocks.previewTenantCsvImportMock.mockResolvedValue({
      headers: ["Email"],
      proposedMapping: { Email: "email" },
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
});
