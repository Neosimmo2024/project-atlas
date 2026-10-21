import { searchGlobally } from "@/repositories/global-search";
import type { TenantContext } from "@/types/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ createSupabaseServerClient: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.createSupabaseServerClient }));
const context: TenantContext = { tenantId: "tenant-a", tenant: { id: "tenant-a", name: "Tenant A" }, userId: "user-a", role: "reader" };
describe("global search repository", () => {
  beforeEach(() => {
    mocks.rpc.mockReset().mockResolvedValue({ data: [], error: null });
    mocks.createSupabaseServerClient.mockReset().mockResolvedValue({ rpc: mocks.rpc });
  });
  it("does not query for too short a query", async () => {
    expect((await searchGlobally(context, "a")).people).toEqual([]);
    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
  });
  it("passes the server tenant and query to database search, without a recent-row cutoff", async () => {
    await searchGlobally(context, "Lyon");
    expect(mocks.rpc).toHaveBeenCalledWith("atlas_global_search", { p_tenant_id: "tenant-a", p_query: "Lyon" });
  });
  it("maps older matching contacts returned by database search", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ category: "people", row_data: {
      id: "old-contact", display_name: "Élodie", city: "Lyon", updated_at: "2020-01-01T00:00:00Z"
    } }], error: null });
    const result = await searchGlobally(context, "elodie");
    expect(result.people[0]).toMatchObject({ id: "old-contact", title: "Élodie", href: "/people/old-contact" });
    expect(result.organizations).toEqual([]);
  });
  it("propagates database failures", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "Database unavailable" } });
    await expect(searchGlobally(context, "Lyon")).rejects.toEqual({ message: "Database unavailable" });
  });
});
