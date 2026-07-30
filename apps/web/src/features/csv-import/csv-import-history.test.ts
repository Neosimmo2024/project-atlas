import { describe, expect, it } from "vitest";
import { parseCsvImportCancellationEligibility, parseCsvImportCancellationReport } from "./csv-import-history";

describe("CSV import history and cancellation parsing", () => {
  it("parses cancellation eligibility without trusting client-side deletion lists", () => {
    const eligibility = parseCsvImportCancellationEligibility({
      importId: "import-1",
      status: "partially_cancellable",
      traceInsufficient: false,
      people: [
        { id: "person-1", label: "Ada", deletable: true },
        { id: "person-2", label: "Grace", deletable: false, reason: "dependance_task" }
      ],
      organizations: [{ id: "org-1", label: "Atlas", deletable: false, reason: "modifiee_apres_import" }],
      summary: { deletable: 1, kept: 2, peopleCreated: 2, organizationsCreated: 1 },
      cancellation: null
    });

    expect(eligibility.status).toBe("partially_cancellable");
    expect(eligibility.people).toHaveLength(2);
    expect(eligibility.people[0]).toMatchObject({ id: "person-1", deletable: true });
    expect(eligibility.organizations[0].reason).toBe("modifiee_apres_import");
  });

  it("parses an idempotent cancellation report with separated deleted and kept entities", () => {
    const report = parseCsvImportCancellationReport({
      id: "cancel-1",
      importId: "import-1",
      idempotent: true,
      status: "partial",
      summary: { peopleDeleted: 1, peopleKept: 1, organizationsDeleted: 0, organizationsKept: 1 },
      peopleDeleted: [{ id: "person-1", label: "Ada", deletable: true }],
      peopleKept: [{ id: "person-2", label: "Grace", deletable: false, reason: "dependance_project" }],
      organizationsDeleted: [],
      organizationsKept: [{ id: "org-1", label: "Atlas", deletable: false, reason: "dependance_relationship" }],
      executedAt: "2026-07-30T12:00:00Z"
    });

    expect(report.idempotent).toBe(true);
    expect(report.summary.peopleDeleted).toBe(1);
    expect(report.peopleKept[0].reason).toBe("dependance_project");
    expect(report.organizationsKept[0].label).toBe("Atlas");
  });
});
