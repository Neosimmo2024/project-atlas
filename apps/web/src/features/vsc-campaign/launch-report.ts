/**
 * Offline VSC launch report for administrators.
 * No state mutation and no implied successful database deployment.
 */
import { assessVscReadiness, type VscReadiness } from "./readiness";

export type VscLaunchReport = {
  tenant: "VendreSonCommerce";
  offer: "79 EUR HT jusqu'au 30 novembre 2026";
  ready: boolean;
  missing: string[];
  verifiedChecks: number;
  totalChecks: number;
  sendingEnabled: false;
};

export function createVscLaunchReport(checks: VscReadiness): VscLaunchReport {
  const result = assessVscReadiness(checks);
  return {
    tenant: "VendreSonCommerce",
    offer: "79 EUR HT jusqu'au 30 novembre 2026",
    ready: result.ready,
    missing: result.missing,
    verifiedChecks: result.passed,
    totalChecks: result.total,
    sendingEnabled: false
  };
}
