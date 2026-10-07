import { beforeEach, describe, expect, it, vi } from "vitest";
import { listProjectProfiles } from "@/repositories/project-profiles";
import type { Project, TenantContext } from "@/types/domain";

const mocks = vi.hoisted(() => ({ client: vi.fn(), eq: vi.fn(), ids: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.client }));
const context = { tenantId: "tenant-a" } as TenantContext;
const first = "11111111-1111-4111-8111-111111111111";
const second = "22222222-2222-4222-8222-222222222222";
const project = (ids: unknown) => ({ metadata: { lyon_development: { person_ids: ids } } }) as Project;

describe("project profiles", () => {
  beforeEach(() => {
    mocks.ids.mockReset().mockResolvedValue({ data: [{ id: second }, { id: first }], error: null });
    mocks.eq.mockReset().mockReturnValue({ in: mocks.ids });
    mocks.client.mockReset().mockResolvedValue({ from: () => ({ select: () => ({ eq: mocks.eq }) }) });
  });
  it("scopes selected contacts to the server tenant and preserves project order", async () => {
    expect(await listProjectProfiles(context, project([first, second, first, "invalid"]))).toEqual([{ id: first }, { id: second }]);
    expect(mocks.eq).toHaveBeenCalledWith("tenant_id", "tenant-a");
    expect(mocks.ids).toHaveBeenCalledWith("id", [first, second]);
  });
  it("does not query for malformed or absent selections", async () => {
    expect(await listProjectProfiles(context, project("invalid"))).toEqual([]);
    expect(await listProjectProfiles(context, { metadata: {} } as Project)).toEqual([]);
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("does not substitute unrelated people for missing or inaccessible selections", async () => {
    mocks.ids.mockResolvedValue({ data: [{ id: first }], error: null });
    expect(await listProjectProfiles(context, project([first, second]))).toEqual([{ id: first }]);
  });
});
