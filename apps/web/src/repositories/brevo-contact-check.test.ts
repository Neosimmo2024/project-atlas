import { beforeEach, describe, expect, it, vi } from "vitest";
import { inspectAndRecordBrevoContactAttempt as check } from "./brevo-contact-check";
const m = vi.hoisted(() => ({ context: vi.fn(), client: vi.fn(), server: vi.fn(), rpc: vi.fn(),
  from: vi.fn(), select: vi.fn(), eq: vi.fn(), single: vi.fn(), inspect: vi.fn() }));
vi.mock("./tenant-context", () => ({ getTenantContext: m.context }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: m.client }));
vi.mock("@/lib/supabase/service-role", () => ({ createSupabaseServiceRoleClient: m.server }));
vi.mock("./brevo-contact-reconciliation", () => ({ inspectAuthorizedBrevoContactAttempt: m.inspect }));
const tenantId = "11111111-1111-4111-8111-111111111111", id = "22222222-2222-4222-8222-222222222222";
const checkId = "33333333-3333-4333-8333-333333333333";
const actor = { tenantId, userId: "44444444-4444-4444-8444-444444444444", role: "owner" };
const options = { enabled: true, accountTenantId: tenantId, apiKey: "fixture" };
beforeEach(() => {
  vi.resetAllMocks();
  m.context.mockResolvedValue({ ...actor });
  const q = { select: m.select, eq: m.eq, maybeSingle: m.single };
  for (const fn of [m.from, m.select, m.eq]) fn.mockReturnValue(q);
  m.client.mockResolvedValue({ from: m.from });
  m.single.mockResolvedValue({ data: { id, tenant_id: tenantId, status: "write_outcome_unknown" }, error: null });
  m.inspect.mockResolvedValue({ status: "linked_contact_observed_review_required", retryAllowed: false });
  m.server.mockReturnValue({ rpc: m.rpc });
  m.rpc.mockResolvedValue({ data: checkId, error: null });
});
describe("audited Brevo observations", () => {
  it("does nothing until explicitly enabled", async () => {
    expect(await check(id, { ...options, enabled: false })).toEqual({ status: "disabled", recorded: false, retryAllowed: false });
    expect(m.context).not.toHaveBeenCalled(); expect(m.server).not.toHaveBeenCalled();
  });
  it("rejects malformed IDs before access", async () => {
    expect((await check("bad", options)).status).toBe("invalid_identity"); expect(m.context).not.toHaveBeenCalled();
  });
  it.each([null, { ...actor, role: "reader" }, { ...actor, tenantId: id }])("rejects unauthorized context %j", async context => {
    m.context.mockResolvedValue(context); expect((await check(id, options)).recorded).toBe(false);
    expect(m.inspect).not.toHaveBeenCalled(); expect(m.server).not.toHaveBeenCalled();
  });
  it("records only a minimal observation, with session-derived actor", async () => {
    expect(await check(id, options)).toEqual({ status: "linked_contact_observed_review_required", recorded: true, checkId, retryAllowed: false });
    expect(m.rpc).toHaveBeenCalledWith("record_brevo_contact_check", {
      p_tenant_id: tenantId, p_user_id: actor.userId, p_attempt_id: id,
      p_attempt_status: "write_outcome_unknown", p_outcome: "linked_contact_observed_review_required",
    });
    expect(m.eq).toHaveBeenCalledWith("tenant_id", tenantId);
  });
  it.each(["source_changed", "outcome_unresolved", "suppression_required", "verification_failed"])("records %s without granting retry", async status => {
    m.inspect.mockResolvedValue({ status, retryAllowed: false });
    expect(await check(id, options)).toEqual({ status, recorded: true, checkId, retryAllowed: false });
  });
  it.each([null, { id, tenant_id: id, status: "pending" }])("rejects missing or foreign attempt %j", async data => {
    m.single.mockResolvedValue({ data, error: null }); await check(id, options);
    expect(m.inspect).not.toHaveBeenCalled(); expect(m.server).not.toHaveBeenCalled();
  });
  it("does not inspect a completed attempt", async () => {
    m.single.mockResolvedValue({ data: { id, tenant_id: tenantId, status: "created" }, error: null });
    expect((await check(id, options)).status).toBe("attempt_already_final"); expect(m.inspect).not.toHaveBeenCalled();
  });
  it.each([null, { ...actor, role: "reader" }, { ...actor, userId: id }, { ...actor, tenantId: id }])("rechecks session before privileged write %j", async fresh => {
    m.context.mockResolvedValueOnce(actor).mockResolvedValue(fresh);
    expect((await check(id, options)).recorded).toBe(false); expect(m.server).not.toHaveBeenCalled();
  });
  it("never persists an arbitrary provider message", async () => {
    m.inspect.mockResolvedValue({ status: "unauthorized_source", retryAllowed: false });
    expect((await check(id, options)).recorded).toBe(false); expect(m.server).not.toHaveBeenCalled();
  });
  it.each([{ data: null, error: { message: "private" } }, { data: "bad", error: null }])("does not announce an unsuccessful audit %j", async result => {
    m.rpc.mockResolvedValue(result);
    expect(await check(id, options)).toEqual({ status: "audit_unavailable", recorded: false, retryAllowed: false });
  });
  it("redacts a thrown infrastructure error", async () => {
    m.server.mockImplementation(() => { throw new Error("private-key"); });
    expect(await check(id, options)).toEqual({ status: "audit_unavailable", recorded: false, retryAllowed: false });
  });
});
