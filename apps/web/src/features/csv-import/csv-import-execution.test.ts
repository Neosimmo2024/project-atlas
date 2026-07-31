import { describe, expect, it } from "vitest";
import { buildCsvImportExecutionRows, parseCsvImportExecutionReport, summarizeCsvImportExecution } from "./csv-import-execution";
import type { CsvImportPreviewResult } from "./csv-import";

function preview(): CsvImportPreviewResult {
  return {
    headers: ["First", "Last", "Email", "Organization"],
    proposedMapping: {
      First: "first_name",
      Last: "last_name",
      Email: "email",
      Organization: "organization"
    },
    unmappedHeaders: [],
    analysisFingerprint: "[[\"Email\",\"email\"]]",
    summary: {
      totalRows: 3,
      newContacts: 1,
      existingContactsToEnrich: 1,
      certainDuplicates: 0,
      possibleDuplicates: 0,
      criticalConflicts: 1,
      rejectedRows: 0,
      cleanRows: 1,
      internalDuplicates: 0,
      atlasMatches: 1,
      ambiguousRows: 1,
      pendingDecisions: 2
    },
    rows: [
      {
        lineNumber: 2,
        originalValues: { First: "Ada", Last: "Lovelace", Email: "ada@example.test", Organization: "Atlas" },
        normalizedValues: { first_name: "Ada", last_name: "Lovelace", email: "ada@example.test", organization: "Atlas" },
        mapping: { First: "first_name", Last: "last_name", Email: "email", Organization: "organization" },
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
      },
      {
        lineNumber: 3,
        originalValues: { First: "Grace", Last: "Hopper", Email: "grace@example.test", Organization: "" },
        normalizedValues: { first_name: "Grace", last_name: "Hopper", email: "grace@example.test" },
        mapping: { First: "first_name", Last: "last_name", Email: "email", Organization: "organization" },
        classification: "existing_contact_enrichment",
        reason: "Contact existant trouve.",
        existingPersonId: "11111111-1111-4111-8111-111111111111",
        fieldsToEnrich: {},
        fieldConflicts: {},
        matches: [],
        organizationMatches: [],
        recommendedDecision: "link_existing",
        decisionRequired: true,
        duplicatePersonIds: ["11111111-1111-4111-8111-111111111111"],
        possibleDuplicatePersonIds: [],
        duplicateOrganizationIds: [],
        possibleDuplicateOrganizationIds: [],
        warnings: [],
        errors: []
      },
      {
        lineNumber: 4,
        originalValues: { First: "Conflict", Last: "Row", Email: "conflict@example.test", Organization: "" },
        normalizedValues: { first_name: "Conflict", last_name: "Row", email: "conflict@example.test" },
        mapping: { First: "first_name", Last: "last_name", Email: "email", Organization: "organization" },
        classification: "critical_conflict",
        reason: "Conflit critique.",
        existingPersonId: null,
        fieldsToEnrich: {},
        fieldConflicts: {},
        matches: [],
        organizationMatches: [],
        recommendedDecision: "review_later",
        decisionRequired: true,
        duplicatePersonIds: ["22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"],
        possibleDuplicatePersonIds: [],
        duplicateOrganizationIds: [],
        possibleDuplicateOrganizationIds: [],
        warnings: [],
        errors: []
      }
    ]
  };
}

describe("CSV import execution", () => {
  it("builds executable rows only after decision validation", () => {
    const result = buildCsvImportExecutionRows(preview(), [
      { lineNumber: 2, decision: "create_new" },
      { lineNumber: 3, decision: "link_existing", targetPersonId: "11111111-1111-4111-8111-111111111111" },
      { lineNumber: 4, decision: "review_later" }
    ], "[[\"Email\",\"email\"]]");

    expect(result).toEqual([
      expect.objectContaining({ lineNumber: 2, decision: "create_new", targetPersonId: null }),
      expect.objectContaining({ lineNumber: 3, decision: "link_existing", targetPersonId: "11111111-1111-4111-8111-111111111111" }),
      expect.objectContaining({ lineNumber: 4, decision: "review_later" })
    ]);
  });

  it("blocks stale analysis fingerprints before building SQL payloads", () => {
    expect(() => buildCsvImportExecutionRows(preview(), [
      { lineNumber: 2, decision: "create_new" },
      { lineNumber: 3, decision: "link_existing", targetPersonId: "11111111-1111-4111-8111-111111111111" },
      { lineNumber: 4, decision: "review_later" }
    ], "stale")).toThrow("correspondance");
  });

  it("blocks critical conflicts from being created", () => {
    expect(() => buildCsvImportExecutionRows(preview(), [
      { lineNumber: 2, decision: "create_new" },
      { lineNumber: 3, decision: "link_existing", targetPersonId: "11111111-1111-4111-8111-111111111111" },
      { lineNumber: 4, decision: "create_new" }
    ], "[[\"Email\",\"email\"]]")).toThrow("conflit");
  });

  it("summarizes the final confirmation with pipeline relationships only when the global option is enabled", () => {
    const decisions: Parameters<typeof summarizeCsvImportExecution>[1] = [
      { lineNumber: 2, decision: "create_new" },
      { lineNumber: 3, decision: "link_existing", targetPersonId: "11111111-1111-4111-8111-111111111111" },
      { lineNumber: 4, decision: "review_later" }
    ];
    const disabledSummary = summarizeCsvImportExecution(preview(), decisions);
    const enabledSummary = summarizeCsvImportExecution(preview(), decisions, true);

    expect(disabledSummary).toMatchObject({
      createNew: 1,
      linkExisting: 1,
      reviewLater: 1,
      organizationsToCreate: 1,
      relationshipsToCreate: 0
    });
    expect(enabledSummary.relationshipsToCreate).toBe(1);
  });

  it("parses idempotent SQL reports without exposing technical fields", () => {
    const report = parseCsvImportExecutionReport({
      id: "import-1",
      idempotent: true,
      sourceName: "contacts.csv",
      analysisFingerprint: "fingerprint",
      summary: {
        totalRows: 1,
        peopleCreated: 1,
        peopleLinked: 0,
        organizationsCreated: 0,
        organizationsLinked: 0,
        relationshipsCreated: 0,
        relationshipsLinked: 1,
        relationshipsSkipped: 0,
        pipelineIntegrationEnabled: true,
        rowsIgnored: 0,
        rowsReviewLater: 0,
        rowsRejected: 0,
        errorsCount: 0
      },
      rows: [{
        lineNumber: 2,
        decision: "create_new",
        outcome: "created",
        personId: "person-1",
        personCreated: true,
        relationshipId: "relationship-1",
        relationshipLinked: true,
        relationshipOutcome: "existing",
        relationshipReason: "existing_relationship"
      }],
      errors: [],
      createdAt: "2026-07-30T12:00:00Z"
    });

    expect(report.idempotent).toBe(true);
    expect(report.summary.pipelineIntegrationEnabled).toBe(true);
    expect(report.summary.relationshipsLinked).toBe(1);
    expect(report.rows[0]).toMatchObject({ lineNumber: 2, personCreated: true, relationshipLinked: true });
  });
});
