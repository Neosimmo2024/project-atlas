import { searchGlobally } from "@/repositories/global-search";
import type { TenantContext } from "@/types/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient
}));

const context: TenantContext = {
  tenantId: "tenant-a",
  tenant: { id: "tenant-a", name: "Tenant A" },
  userId: "user-a",
  role: "reader"
};

function createQuery(table: string, calls: Array<{ table: string; method: string; args: unknown[] }>) {
  const query = {
    select: (...args: unknown[]) => {
      calls.push({ table, method: "select", args });
      return query;
    },
    eq: (...args: unknown[]) => {
      calls.push({ table, method: "eq", args });
      return query;
    },
    is: (...args: unknown[]) => {
      calls.push({ table, method: "is", args });
      return query;
    },
    order: (...args: unknown[]) => {
      calls.push({ table, method: "order", args });
      return query;
    },
    limit: (...args: unknown[]) => {
      calls.push({ table, method: "limit", args });
      return Promise.resolve({ data: [], error: null });
    }
  };
  return query;
}

describe("global search repository", () => {
  beforeEach(() => {
    mocks.createSupabaseServerClient.mockReset();
  });

  it("does not query Supabase for an empty or too short query", async () => {
    const results = await searchGlobally(context, "a");

    expect(results.people).toEqual([]);
    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("scopes every source query to the active tenant from the server context", async () => {
    const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
    mocks.createSupabaseServerClient.mockResolvedValue({
      from: (table: string) => createQuery(table, calls)
    });

    await searchGlobally(context, "atlas");

    const queriedTables = ["people", "organizations", "relationships", "projects", "interactions", "tasks"];
    for (const table of queriedTables) {
      expect(calls).toContainEqual({ table, method: "eq", args: ["tenant_id", "tenant-a"] });
    }
    expect(calls.some((call) => call.args.includes("tenant-b"))).toBe(false);
  });
});

