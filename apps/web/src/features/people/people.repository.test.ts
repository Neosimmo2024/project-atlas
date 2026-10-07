import { listPeople } from "@/repositories/people";
import type { TenantContext } from "@/types/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), createSupabaseServerClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.createSupabaseServerClient }));
vi.mock("@/services/timeline-service", () => ({ recordPersonCreated: vi.fn() }));
const context: TenantContext = { tenantId: "tenant-a", tenant: { id: "tenant-a", name: "Tenant A" }, userId: "user-a", role: "reader" };
describe("people search repository", () => {
  beforeEach(() => {
    mocks.rpc.mockReset().mockResolvedValue({ data: { people: [{ id: "match" }], total: 354 }, error: null });
    mocks.from.mockReset().mockReturnValue({ select: () => ({ eq: () => ({}) }) });
    mocks.createSupabaseServerClient.mockResolvedValue({ rpc: mocks.rpc, from: mocks.from });
  });
  it("filters and pages on the database, without an unbounded qualification ID request", async () => {
    const result = await listPeople(context, { query: " Lyon ", page: 2, status: "to_qualify", qualificationState: "none", talentScore: "unscored" });
    expect(mocks.rpc).toHaveBeenCalledWith("atlas_search_people", { p_tenant_id: "tenant-a", p_query: "Lyon", p_status: "to_qualify", p_priority: "", p_qualification_state: "none", p_talent_score: "unscored", p_page: 2, p_page_size: 10 });
    expect(result).toMatchObject({ total: 354, page: 2, pageSize: 10, pageCount: 36, people: [{ id: "match" }] });
    expect(mocks.from).not.toHaveBeenCalledWith("talent_qualifications");
  });
  it("returns the full count on an empty page", async () => {
    mocks.rpc.mockResolvedValue({ data: { people: [], total: 354 }, error: null });
    const result = await listPeople(context, { query: "Lyon", page: 100 });
    expect(result).toMatchObject({ people: [], total: 354, pageCount: 36 });
  });
  it("uses database filtering for qualification alone", async () => {
    await listPeople(context, { qualificationState: "completed" });
    expect(mocks.rpc).toHaveBeenCalledWith("atlas_search_people", expect.objectContaining({ p_qualification_state: "completed", p_query: "" }));
  });
});
