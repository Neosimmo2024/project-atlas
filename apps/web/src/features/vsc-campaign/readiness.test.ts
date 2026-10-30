import { describe, expect, it } from "vitest";
import { assessVscReadiness, type VscReadiness } from "./readiness";

const ready: VscReadiness = {
  unitTestsPassed: true, typecheckPassed: true,
  databaseMigrationsTested: true, rlsIsolationTested: true,
  ovhRoundtripVerified: true, replyWorkerTested: true,
  unsubscribeTested: true, campaignApproved: true
};

describe("VSC go-live readiness", () => {
  it("is ready only when every prerequisite is true", () => {
    expect(assessVscReadiness(ready).ready).toBe(true);
  });
  it("refuses go-live with untested RLS or unsubscribe", () => {
    const report = assessVscReadiness({
      ...ready, rlsIsolationTested: false, unsubscribeTested: false
    });
    expect(report.ready).toBe(false);
    expect(report.missing).toEqual(["rlsIsolationTested", "unsubscribeTested"]);
  });
});
