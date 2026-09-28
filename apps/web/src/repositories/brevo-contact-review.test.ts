import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeConfiguredBrevoContactReview as close } from "./brevo-contact-review";
const m = vi.hoisted(() => ({ context: vi.fn(), client: vi.fn(), server: vi.fn(), rpc: vi.fn(),
  from: vi.fn(), select: vi.fn(), eq: vi.fn(), single: vi.fn(), inspect: vi.fn() }));
vi.mock("./tenant-context", () => ({ getTenantContext: m.context }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: m.client }));
vi.mock("@/lib/supabase/service-role", () => ({ createSupabaseServiceRoleClient: m.server }));
vi.mock("./brevo-configured-contact-check", () => ({ inspectConfiguredBrevoContactAttempt: m.inspect }));
const tenantId = "11111111-1111-4111-8111-111111111111", id = "22222222-2222-4222-8222-222222222222";
const checkId = "33333333-3333-4333-8333-333333333333", reviewId = "44444444-4444-4444-8444-444444444444";
const actor = { tenantId, userId: "55555555-5555-4555-8555-555555555555", role: "owner" };
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("ATLAS_BREVO_CONTACT_REVIEW_ENABLED", "1");
  m.context.mockResolvedValue({ ...actor });
  const q = { select: m.select, eq: m.eq, maybeSingle: m.single };
  for (const fn of [m.from, m.select, m.eq]) fn.mockReturnValue(q);
  m.client.mockResolvedValue({ from: m.from });
  m.single.mockResolvedValue({ data: { id, tenant_id: tenantId, status: "write_outcome_unknown" }, error: null });
  m.inspect.mockResolvedValue({ status: "linked_contact_observed_review_required", recorded: true, checkId, retryAllowed: false });
  m.server.mockReturnValue({ rpc: m.rpc }); m.rpc.mockResolvedValue({ data: reviewId, error: null });
});
afterEach(() => vi.unstubAllEnvs());
describe("conservative contact review closure", () => {
  it("defaults to disabled", async () => {
    vi.stubEnv("ATLAS_BREVO_CONTACT_REVIEW_ENABLED", undefined);
    expect((await close(id, "keep_blocked")).status).toBe("disabled"); expect(m.context).not.toHaveBeenCalled();
  });
  it("requires an explicit keep-blocked decision", async () => {
    expect((await close(id, "retry")).status).toBe("confirmation_required"); expect(m.context).not.toHaveBeenCalled();
  });
  it("rejects malformed IDs", async () => {
    expect((await close("bad", "keep_blocked")).status).toBe("invalid_identity"); expect(m.context).not.toHaveBeenCalled();
  });
  it.each([null, { ...actor, role: "reader" }])("rejects unauthorized actor %j", async value => {
    m.context.mockResolvedValue(value); expect((await close(id, "keep_blocked")).status).toBe("unauthorized_attempt");
    expect(m.inspect).not.toHaveBeenCalled(); expect(m.server).not.toHaveBeenCalled();
  });
  it.each([null, { id, tenant_id: id, status: "write_outcome_unknown" }])("rejects missing or foreign attempt %j", async data => {
    m.single.mockResolvedValue({ data, error: null }); await close(id, "keep_blocked");
    expect(m.inspect).not.toHaveBeenCalled(); expect(m.server).not.toHaveBeenCalled();
  });
  it.each(["pending", "created", "failed"])("never closes attempt state %s", async status => {
    m.single.mockResolvedValue({ data: { id, tenant_id: tenantId, status }, error: null });
    expect((await close(id, "keep_blocked")).status).toBe("attempt_not_reviewable"); expect(m.inspect).not.toHaveBeenCalled();
  });
  it.each(["disabled", "account_mismatch", "outcome_unresolved", "source_changed", "suppression_required", "email_change_requires_review"])("rejects evidence %s", async status => {
    m.inspect.mockResolvedValue({ status, recorded: true, checkId });
    expect((await close(id, "keep_blocked")).status).toBe("review_evidence_unavailable"); expect(m.server).not.toHaveBeenCalled();
  });
  it.each([{ recorded: false, checkId }, { recorded: true }, { recorded: true, checkId: "bad" }])("requires a persisted valid check %j", async value => {
    m.inspect.mockResolvedValue({ status: "linked_contact_observed_review_required", ...value });
    expect((await close(id, "keep_blocked")).closed).toBe(false); expect(m.server).not.toHaveBeenCalled();
  });
  it.each([null, { ...actor, role: "reader" }, { ...actor, tenantId: id }, { ...actor, userId: id }])("rechecks session before closure %j", async current => {
    m.context.mockResolvedValueOnce(actor).mockResolvedValue(current);
    expect((await close(id, "keep_blocked")).closed).toBe(false); expect(m.server).not.toHaveBeenCalled();
  });
  it.each(["linked_contact_observed_review_required", "suppression_observed_review_required"])("records review for %s without granting retry", async status => {
    m.inspect.mockResolvedValue({ status, recorded: true, checkId, retryAllowed: false });
    expect(await close(id, "keep_blocked")).toEqual({ status: "review_closed_retry_blocked", closed: true, reviewId, retryAllowed: false });
    expect(m.inspect).toHaveBeenCalledWith(id);
    expect(m.rpc).toHaveBeenCalledWith("close_brevo_contact_review", { p_tenant_id: tenantId, p_user_id: actor.userId, p_attempt_id: id, p_check_id: checkId });
  });
  it.each([{ data: null, error: { message: "private" } }, { data: "bad", error: null }])("does not report failed persistence as closure %j", async response => {
    m.rpc.mockResolvedValue(response);
    expect(await close(id, "keep_blocked")).toEqual({ status: "review_unavailable", closed: false, retryAllowed: false });
  });
  it("redacts private infrastructure failures", async () => {
    m.inspect.mockRejectedValue(new Error("private-key"));
    expect(await close(id, "keep_blocked")).toEqual({ status: "review_unavailable", closed: false, retryAllowed: false });
  });
});
