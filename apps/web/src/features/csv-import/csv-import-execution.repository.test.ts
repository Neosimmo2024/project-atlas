import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CsvImportPreviewResult } from "./csv-import";
import type { TenantContext } from "@/types/domain";

const mocks = vi.hoisted(() => ({
  serviceRpc: vi.fn(),
  createServiceClient: vi.fn()
}));

vi.mock("@/lib/supabase/service-role", () => ({
  createSupabaseServiceRoleClient: mocks.createServiceClient
}));

const context: TenantContext = {
  tenantId: "tenant-a",
  tenant: { id: "tenant-a", name: "Tenant A" },
  userId: "user-a",
  role: "owner"
};

const preview: CsvImportPreviewResult = {
  headers: ["Email"],
  proposedMapping: { Email: "email" },
  unmappedHeaders: [],
  analysisFingerprint: "fingerprint",
  summary: {
    totalRows: 1,
    newContacts: 1,
    existingContactsToEnrich: 0,
    certainDuplicates: 0,
    possibleDuplicates: 0,
    criticalConflicts: 0,
    rejectedRows: 0,
    cleanRows: 1,
    internalDuplicates: 0,
    atlasMatches: 0,
    ambiguousRows: 0,
    pendingDecisions: 0
  },
  rows: [{
    lineNumber: 2,
    originalValues: { Email: "ada@example.test" },
    normalizedValues: { email: "ada@example.test" },
    mapping: { Email: "email" },
    classification: "new_contact",
    reason: "Aucun doublon detecte.",
    existingPersonId: null,
    fieldsToEnrich: {},
    fieldConflicts: {},
    matches: [],
    organizationMatches: [],
    recommendedDecision: "create_new",
    decisionRequired: false,
    duplicatePersonIds: [],
    possibleDuplicatePersonIds: [],
    duplicateOrganizationIds: [],
    possibleDuplicateOrganizationIds: [],
    warnings: [],
    errors: []
  }]
};

describe("CSV import execution repository", () => {
  beforeEach(() => {
    mocks.serviceRpc.mockReset();
    mocks.createServiceClient.mockReset();
    mocks.createServiceClient.mockReturnValue({ rpc: mocks.serviceRpc });
    mocks.serviceRpc.mockResolvedValue({
      data: {
        id: "import-1",
        sourceName: "contacts.csv",
        analysisFingerprint: "fingerprint",
        summary: {
          totalRows: 1,
          peopleCreated: 1,
          peopleLinked: 0,
          organizationsCreated: 0,
          organizationsLinked: 0,
          relationshipsCreated: 0,
          relationshipsLinked: 0,
          relationshipsSkipped: 0,
          pipelineIntegrationEnabled: true,
          rowsIgnored: 0,
          rowsReviewLater: 0,
          rowsRejected: 0,
          errorsCount: 0
        },
        rows: [],
        errors: [],
        createdAt: "2026-07-30T12:00:00Z"
      },
      error: null
    });
  });

  it("executes the PostgreSQL transaction only through the server service-role client", async () => {
    const { executeTenantCsvImport } = await import("@/repositories/csv-import-execution");

    await executeTenantCsvImport(context, {
      preview,
      decisions: [{ lineNumber: 2, decision: "create_new" }],
      analysisFingerprint: "fingerprint",
      idempotencyKey: "import-key",
      sourceName: "contacts.csv",
      addToPipeline: true
    });

    expect(mocks.createServiceClient).toHaveBeenCalledTimes(1);
    expect(mocks.serviceRpc).toHaveBeenCalledWith("execute_csv_import", expect.objectContaining({
      p_tenant_id: "tenant-a",
      p_actor_user_id: "user-a",
      p_add_to_pipeline: true
    }));
  });
});
