import { describe, expect, it } from "vitest";
import { createVscLaunchReport } from "./launch-report";

describe("VSC prelaunch report", () => {
  it("never enables sends and clearly lists missing prerequisites", () => {
    const report = createVscLaunchReport({
      unitTestsPassed: true, typecheckPassed: true,
      databaseMigrationsTested: false, rlsIsolationTested: false,
      ovhRoundtripVerified: true, replyWorkerTested: false,
      unsubscribeTested: false, campaignApproved: false
    });
    expect(report.ready).toBe(false);
    expect(report.sendingEnabled).toBe(false);
    expect(report.missing).toContain("databaseMigrationsTested");
    expect(report.missing).toContain("unsubscribeTested");
  });
});
