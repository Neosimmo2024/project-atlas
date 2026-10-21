import { beforeEach, describe, expect, it, vi } from "vitest";
import { listBrevoContactHistory } from "./brevo-contact-history";
const mocks = vi.hoisted(() => ({ context: vi.fn(), client: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn(), in: vi.fn() }));
vi.mock("./tenant-context", () => ({ getTenantContext: mocks.context }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.client }));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.context.mockResolvedValue({ tenantId: "tenant-a", role: "owner", tenant: { name: "Atlas" } });
  const query = { select: mocks.select, eq: mocks.eq, order: mocks.order, range: mocks.range, in: mocks.in };
  mocks.client.mockResolvedValue({ from: mocks.from });
  for (const fn of [mocks.from, mocks.select, mocks.eq, mocks.order]) fn.mockReturnValue(query);
  mocks.range.mockResolvedValue({ data: [], error: null, count: 0 });
  mocks.in.mockResolvedValue({ data: [], error: null });
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
  it("reads only reviews for this tenant and visible attempts, preserving uncertain status", async () => {
    mocks.range.mockResolvedValue({ data: [{ id: "attempt-a", status: "write_outcome_unknown" }], error: null, count: 1 });
    const review = { attempt_id: "attempt-a", decision: "linked_observed_keep_blocked", closed_at: "2026-09-28T08:00:00Z" };
    mocks.in.mockResolvedValue({ data: [review], error: null });
    expect(await listBrevoContactHistory()).toMatchObject({ state: "ready", rows: [{ status: "write_outcome_unknown", review: { decision: review.decision, closed_at: review.closed_at } }] });
    expect(mocks.in).toHaveBeenCalledWith("attempt_id", ["attempt-a"]);
    expect(mocks.eq.mock.calls).toEqual([["tenant_id", "tenant-a"], ["tenant_id", "tenant-a"]]);
  });
  it("does not turn missing review access into an unreviewed operation", async () => {
    mocks.range.mockResolvedValue({ data: [{ id: "attempt-a" }], error: null, count: 1 });
    mocks.in.mockResolvedValue({ data: null, error: { code: "42501" } });
    expect(await listBrevoContactHistory()).toEqual({ state: "unavailable" });
  });
  it.each([
    { attempt_id: "foreign", decision: "linked_observed_keep_blocked", closed_at: "2026-09-28T08:00:00Z" },
    { attempt_id: "attempt-a", decision: "retry_allowed", closed_at: "2026-09-28T08:00:00Z" },
    { attempt_id: "attempt-a", decision: "linked_observed_keep_blocked", closed_at: "bad" },
  ])("rejects invalid review data %j", async review => {
    mocks.range.mockResolvedValue({ data: [{ id: "attempt-a" }], error: null, count: 1 });
    mocks.in.mockResolvedValue({ data: [review], error: null });
    expect(await listBrevoContactHistory()).toEqual({ state: "unavailable" });
  });
});
