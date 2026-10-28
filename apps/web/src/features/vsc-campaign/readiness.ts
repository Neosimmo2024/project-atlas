/**
 * Offline VSC campaign readiness report.
 * This is an explicit checklist, not a claim that any integration test passed.
 */
export type VscReadiness = {
  unitTestsPassed: boolean;
  typecheckPassed: boolean;
  databaseMigrationsTested: boolean;
  rlsIsolationTested: boolean;
  ovhRoundtripVerified: boolean;
  replyWorkerTested: boolean;
  unsubscribeTested: boolean;
  campaignApproved: boolean;
};

export function assessVscReadiness(input: VscReadiness) {
  const checks = Object.entries(input).map(([key, passed]) => ({ key, passed }));
  return {
    ready: checks.every(check => check.passed),
    passed: checks.filter(check => check.passed).length,
    total: checks.length,
    missing: checks.filter(check => !check.passed).map(check => check.key)
  };
}
