import { beforeEach, describe, expect, it, vi } from "vitest";
import { listBrevoContactHistory } from "./brevo-contact-history";
const mocks = vi.hoisted(() => ({ context: vi.fn(), client: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn() }));
vi.mock("./tenant-context", () => ({ getTenantContext: mocks.context }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.client }));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.context.mockResolvedValue({ tenantId: "tenant-a", role: "owner", tenant: { name: "Atlas" } });
  const query = { select: mocks.select, eq: mocks.eq, order: mocks.order, range: mocks.range };
  mocks.client.mockResolvedValue({ from: mocks.from });
  for (const fn of [mocks.from, mocks.select, mocks.eq, mocks.order]) fn.mockReturnValue(query);
  mocks.range.mockResolvedValue({ data: [], error: null, count: 0 });
});
describe("Brevo history authorization and availability", () => {
  it.each([null, { role: "reader" }, { role: "manager" }, { role: "recruiter" }])("denies non-admin access without querying history: %o", async context => {
    mocks.context.mockResolvedValue(context);
    expect(await listBrevoContactHistory()).toEqual({ state: "forbidden" });
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("scopes the read to the authenticated tenant and paginates deterministically", async () => {
    expect(await listBrevoContactHistory({ page: "2", status: "pending" })).toMatchObject({ state: "ready", page: 2, status: "pending" });
    expect(mocks.eq.mock.calls).toEqual([["tenant_id", "tenant-a"], ["status", "pending"]]);
    expect(mocks.range).toHaveBeenCalledWith(20, 39);
    expect(mocks.order.mock.calls).toEqual([["created_at", { ascending: false }], ["id", { ascending: false }]]);
  });
  it.each(["42P01", "PGRST205"])("distinguishes missing journal %s from an empty history", async code => {
    mocks.range.mockResolvedValue({ data: null, count: null, error: { code } });
    expect(await listBrevoContactHistory()).toEqual({ state: "not_installed" });
  });
  it("does not turn permission failures into zero operations", async () => {
    mocks.range.mockResolvedValue({ data: null, error: { code: "42501", message: "sensitive" } });
    expect(await listBrevoContactHistory()).toEqual({ state: "unavailable" });
  });
  it("does not leak authentication errors", async () => {
    mocks.context.mockRejectedValue(new Error("sensitive"));
    expect(await listBrevoContactHistory()).toEqual({ state: "unavailable" });
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("ignores invalid status and bounds malformed pagination", async () => {
    expect(await listBrevoContactHistory({ status: "__proto__", page: "Infinity" })).toMatchObject({ state: "ready", page: 1, status: "" });
    expect(mocks.eq.mock.calls).toEqual([["tenant_id", "tenant-a"]]);
    expect(mocks.range).toHaveBeenCalledWith(0, 19);
  });
  it("distinguishes a successful empty response", async () => {
    expect(await listBrevoContactHistory()).toMatchObject({ state: "ready", rows: [], total: 0 });
  });
});
