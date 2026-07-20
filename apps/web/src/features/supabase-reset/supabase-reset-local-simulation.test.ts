import { beforeAll, describe, expect, it } from "vitest";

type SimulationModule = {
  EXPECTED_CONFIRMATION: string;
  EXPECTED_COUNTS: Record<string, number>;
  LOCAL_PROJECT_REF: string;
  assertExactSnapshotCounts: (observedCounts: Record<string, number | undefined | null>) => void;
  assertLocalOnlyEnvironment: (env?: Record<string, string | undefined>) => void;
  evaluateSnapshotCounts: (
    observedCounts: Record<string, number | undefined | null>
  ) => Array<{ tableName: string; expected: number; observed: number | null }>;
  validateManualResetInputs: (input: {
    projectRef: string;
    confirmation: string;
    applyReset: boolean;
    authorizedSha?: string;
    actualSha?: string;
    allowedProjectRef?: string;
  }) => void;
};

const validSha = "2f3ed0dd951b9698ca931b705daec1806477444a";
let simulation: SimulationModule;

beforeAll(async () => {
  // @ts-expect-error The reset simulation is a Node-only script outside the web TS project.
  simulation = await import("../../../../../scripts/supabase-reset-local-simulation.mjs");
});

function exactCounts() {
  return { ...simulation.EXPECTED_COUNTS };
}

describe("Supabase reset local simulation guards", () => {
  it("accepts the exact authorized local snapshot", () => {
    expect(() => simulation.assertExactSnapshotCounts(exactCounts())).not.toThrow();
  });

  it("refuses a lower count", () => {
    const counts = exactCounts();
    counts["public.tasks"] = simulation.EXPECTED_COUNTS["public.tasks"] - 1;

    expect(simulation.evaluateSnapshotCounts(counts)).toEqual([
      { tableName: "public.tasks", expected: 4, observed: 3 }
    ]);
    expect(() => simulation.assertExactSnapshotCounts(counts)).toThrow("public.tasks");
  });

  it("refuses a higher count", () => {
    const counts = exactCounts();
    counts["public.interactions"] = simulation.EXPECTED_COUNTS["public.interactions"] + 1;

    expect(simulation.evaluateSnapshotCounts(counts)).toEqual([
      { tableName: "public.interactions", expected: 4, observed: 5 }
    ]);
  });

  it("refuses an unexpected zero", () => {
    const counts = exactCounts();
    counts["auth.users"] = 0;

    expect(simulation.evaluateSnapshotCounts(counts)).toEqual([
      { tableName: "auth.users", expected: 1, observed: 0 }
    ]);
  });

  it("refuses NULL or missing observations", () => {
    const counts = exactCounts();
    delete counts["public.people"];

    expect(simulation.evaluateSnapshotCounts(counts)).toEqual([
      { tableName: "public.people", expected: 1, observed: null }
    ]);
  });

  it("refuses simulated table access errors by surfacing the failing table as missing", () => {
    const counts = exactCounts();
    delete counts["public.organizations"];

    expect(() => simulation.assertExactSnapshotCounts(counts)).toThrow("public.organizations");
  });

  it("refuses storage buckets and objects", () => {
    const bucketCounts = exactCounts();
    bucketCounts["storage.buckets"] = 1;
    const objectCounts = exactCounts();
    objectCounts["storage.objects"] = 1;

    expect(simulation.evaluateSnapshotCounts(bucketCounts)).toEqual([
      { tableName: "storage.buckets", expected: 0, observed: 1 }
    ]);
    expect(simulation.evaluateSnapshotCounts(objectCounts)).toEqual([
      { tableName: "storage.objects", expected: 0, observed: 1 }
    ]);
  });

  it("refuses auth.users equal to two", () => {
    const counts = exactCounts();
    counts["auth.users"] = 2;

    expect(simulation.evaluateSnapshotCounts(counts)).toEqual([
      { tableName: "auth.users", expected: 1, observed: 2 }
    ]);
  });

  it("does not allow reset execution after a failed guard", () => {
    let resetWouldRun = false;
    const counts = exactCounts();
    counts["public.audit_log"] = 28;

    expect(() => {
      simulation.assertExactSnapshotCounts(counts);
      resetWouldRun = true;
    }).toThrow("public.audit_log");
    expect(resetWouldRun).toBe(false);
  });

  it("accepts only the exact local confirmation inputs", () => {
    expect(() =>
      simulation.validateManualResetInputs({
        projectRef: simulation.LOCAL_PROJECT_REF,
        confirmation: simulation.EXPECTED_CONFIRMATION,
        applyReset: true,
        authorizedSha: validSha
      })
    ).not.toThrow();
  });

  it("refuses incorrect project ref, confirmation phrase, apply flag, authorized sha and checkout sha", () => {
    expect(() =>
      simulation.validateManualResetInputs({
        projectRef: "aqmuvakvienfwzhgzhcw",
        confirmation: simulation.EXPECTED_CONFIRMATION,
        applyReset: true,
        authorizedSha: validSha
      })
    ).toThrow("unauthorized project_ref");

    expect(() =>
      simulation.validateManualResetInputs({
        projectRef: simulation.LOCAL_PROJECT_REF,
        confirmation: "RESET",
        applyReset: true,
        authorizedSha: validSha
      })
    ).toThrow("confirmation phrase");

    expect(() =>
      simulation.validateManualResetInputs({
        projectRef: simulation.LOCAL_PROJECT_REF,
        confirmation: simulation.EXPECTED_CONFIRMATION,
        applyReset: false,
        authorizedSha: validSha
      })
    ).toThrow("apply_reset");

    expect(() =>
      simulation.validateManualResetInputs({
        projectRef: simulation.LOCAL_PROJECT_REF,
        confirmation: simulation.EXPECTED_CONFIRMATION,
        applyReset: true,
        authorizedSha: "not-a-sha"
      })
    ).toThrow("authorized_sha");

    expect(() =>
      simulation.validateManualResetInputs({
        projectRef: simulation.LOCAL_PROJECT_REF,
        confirmation: simulation.EXPECTED_CONFIRMATION,
        applyReset: true,
        authorizedSha: validSha,
        actualSha: "8149e9f4e04ce968a65d39f0f766b9d157b4b5f2"
      })
    ).toThrow("checked-out SHA");
  });

  it("refuses non-local Supabase and database URLs", () => {
    expect(() =>
      simulation.assertLocalOnlyEnvironment({
        QA_SUPABASE_URL: "http://127.0.0.1:54321",
        NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
        QA_DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
      })
    ).not.toThrow();

    expect(() =>
      simulation.assertLocalOnlyEnvironment({
        QA_SUPABASE_URL: "https://aqmuvakvienfwzhgzhcw.supabase.co",
        QA_DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
      })
    ).toThrow("localhost or 127.0.0.1");

    expect(() =>
      simulation.assertLocalOnlyEnvironment({
        QA_SUPABASE_URL: "http://127.0.0.1:54321",
        QA_DB_URL: "postgresql://postgres:postgres@db.aqmuvakvienfwzhgzhcw.supabase.co:5432/postgres"
      })
    ).toThrow("local PostgreSQL host");
  });
});
