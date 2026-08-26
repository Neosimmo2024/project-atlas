import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type SimulationModule = {
  EXPECTED_CONFIRMATION: string;
  EXPECTED_COUNTS: Record<string, number>;
  LOCAL_AUTH_READINESS: {
    timeoutMs: number;
    retryDelayMs: number;
    requestTimeoutMs: number;
    healthPath: string;
  };
  LOCAL_PROJECT_REF: string;
  assertExactSnapshotCounts: (observedCounts: Record<string, number | undefined | null>) => void;
  assertLocalOnlyEnvironment: (env?: Record<string, string | undefined>) => void;
  describeLocalAuthReadiness: (input: {
    gatewayStatus?: number;
    gatewayBody?: string;
    adminError?: string;
  }) => string;
  evaluateSnapshotCounts: (
    observedCounts: Record<string, number | undefined | null>
  ) => Array<{ tableName: string; expected: number; observed: number | null }>;
  isRetryableLocalAuthStatus: (status: number) => boolean;
  localAuthHealthUrl: (url: string) => string;
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
const source = readFileSync(resolve(process.cwd(), "..", "..", "scripts", "supabase-reset-local-simulation.mjs"), "utf8");

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

  it("counts every table in the authorized snapshot query", () => {
    for (const tableName of Object.keys(simulation.EXPECTED_COUNTS)) {
      const escapedTableName = tableName.replaceAll(".", "\\.");
      expect(source).toMatch(
        new RegExp(`select '${escapedTableName}'(?: as table_name)?, count\\(\\*\\)::integer(?: as observed_count)? from ${escapedTableName}`)
      );
    }
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

  it("refuses remote PostgreSQL host environment variables during local simulation", () => {
    expect(() =>
      simulation.assertLocalOnlyEnvironment({
        QA_SUPABASE_URL: "http://127.0.0.1:54321",
        QA_DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
        PGHOST: "aws-0-eu-central-1.pooler.supabase.com"
      })
    ).toThrow("PGHOST must not target a remote PostgreSQL host");

    expect(() =>
      simulation.assertLocalOnlyEnvironment({
        QA_SUPABASE_URL: "http://127.0.0.1:54321",
        QA_DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
        SUPABASE_POOLER_HOST: "aws-0-eu-central-1.pooler.supabase.com"
      })
    ).toThrow("SUPABASE_POOLER_HOST must not target a remote PostgreSQL host");
  });

  it("checks local Auth readiness through the gateway with bounded retries", () => {
    expect(simulation.LOCAL_AUTH_READINESS).toEqual({
      timeoutMs: 120000,
      retryDelayMs: 2000,
      requestTimeoutMs: 5000,
      healthPath: "/auth/v1/health"
    });
    expect(simulation.localAuthHealthUrl("http://127.0.0.1:54321")).toBe("http://127.0.0.1:54321/auth/v1/health");
    expect(simulation.localAuthHealthUrl("http://localhost:54321/")).toBe("http://localhost:54321/auth/v1/health");
    expect(() => simulation.localAuthHealthUrl("https://aqmuvakvienfwzhgzhcw.supabase.co")).toThrow("localhost or 127.0.0.1");
  });

  it("treats temporary gateway failures as retryable but keeps diagnostics explicit", () => {
    expect(simulation.isRetryableLocalAuthStatus(502)).toBe(true);
    expect(simulation.isRetryableLocalAuthStatus(503)).toBe(true);
    expect(simulation.isRetryableLocalAuthStatus(504)).toBe(true);
    expect(simulation.isRetryableLocalAuthStatus(401)).toBe(false);

    expect(simulation.describeLocalAuthReadiness({
      gatewayStatus: 502,
      gatewayBody: "{}",
      adminError: "name=AuthRetryableFetchError status=502 message={}"
    })).toBe("gateway=502 gateway_body={} admin=name=AuthRetryableFetchError status=502 message={}");
  });

  it("restarts only local Supabase services after each local reset before Auth bootstrap", () => {
    expect(source).toContain("async function restartLocalSupabaseAfterReset()");
    expect(source).toContain("Local Supabase services restarted after reset before Auth bootstrap.");
    expect(source).not.toContain("db reset --linked");

    const resetToRestartMatches = source.match(/await runLocalReset\(\);\s+await restartLocalSupabaseAfterReset\(\);/g) ?? [];
    expect(resetToRestartMatches).toHaveLength(2);
  });

  it("verifies CSV import execution schema and RPC privileges after local reset", () => {
    expect(source).toContain("public.csv_import_runs.payload_fingerprint is missing.");
    expect(source).toContain("authenticated role must not execute execute_csv_import directly.");
    expect(source).toContain("anon role must not execute execute_csv_import.");
    expect(source).toContain("service_role must not execute legacy execute_csv_import.");
    expect(source).toContain("authenticated role must not execute pipeline-enabled execute_csv_import directly.");
    expect(source).toContain("service_role must execute server-only pipeline-enabled execute_csv_import.");
    expect(source).toContain("RLS is not enabled on public.csv_import_cancellations.");
    expect(source).toContain("authenticated role must not insert public.csv_import_cancellations directly.");
    expect(source).toContain("authenticated role cannot execute cancel_csv_import.");
    expect(source).toContain("anon role must not execute cancel_csv_import.");
    expect(source).toContain("authenticated role cannot execute list_tenant_members_for_admin.");
    expect(source).toContain("anon role must not execute list_tenant_members_for_admin.");
    expect(source).toContain("service_role cannot execute list_tenant_members_for_admin.");
  });
});
