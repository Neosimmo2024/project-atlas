declare module "*.mjs" {
  export const EXPECTED_CONFIRMATION: string;
  export const EXPECTED_COUNTS: Record<string, number>;
  export const LOCAL_PROJECT_REF: string;

  export function assertExactSnapshotCounts(observedCounts: Record<string, number | undefined | null>): void;
  export function assertLocalOnlyEnvironment(env?: Record<string, string | undefined>): void;
  export function evaluateSnapshotCounts(
    observedCounts: Record<string, number | undefined | null>,
    expectedCounts?: Record<string, number>
  ): Array<{ tableName: string; expected: number; observed: number | null }>;
  export function validateManualResetInputs(input: {
    projectRef: string;
    confirmation: string;
    applyReset: boolean;
    authorizedSha?: string;
    actualSha?: string;
    allowedProjectRef?: string;
  }): void;
}
