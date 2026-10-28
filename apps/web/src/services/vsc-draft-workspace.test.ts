import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/service-role", () => ({ createSupabaseServiceRoleClient: () => ({ rpc }) }));
import { previewVscEmailDraft, saveVscEmailDraft, validateVscDraftRequest, vscDraftToday } from "./vsc-draft-workspace";
const tenant = "20000000-0000-0000-0000-000000000001", person = "30000000-0000-0000-0000-000000000001";
const input = { campaignId: "40000000-0000-0000-0000-000000000001", name: "Test draft", startDate: "2026-10-28", personIds: [person] };
describe("VSC email draft preparation", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-28T12:00:00Z")); vi.stubEnv("VSC_OVH_TENANT_ID", tenant);
    rpc.mockReset(); rpc.mockResolvedValue({ data: [{ id: person, display_name: "Fixture", primary_email: "fixture@example.invalid" }], error: null });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
  it("uses Paris for the default date", () => expect(vscDraftToday(new Date("2026-10-28T23:30:00Z"))).toBe("2026-10-29"));
  it("rejects missing, invalid, duplicate or excessive contact selections", () => {
    for (const value of [null, {}, { ...input, startDate: "2026-02-31" }, { ...input, startDate: "2026-10-27" }, { ...input, startDate: "2026-12-01" }, { ...input, personIds: [] }, { ...input, personIds: [person, person] }, { ...input, campaignId: "bad" }, { ...input, personIds: Array(101).fill(person) }]) expect(() => validateVscDraftRequest(value)).toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("builds email-only drafts with the promotional cutoff", async () => {
    const result = await previewVscEmailDraft(tenant, input);
    expect(result.plan.map(x => [x.channel, x.scheduledDate])).toEqual([["email", "2026-10-28"], ["email", "2026-11-17"]]);
    expect(result.sendingEnabled).toBe(false); expect(rpc).toHaveBeenCalledWith("vsc_email_draft_contacts", { p_tenant_id: tenant, p_person_ids: [person] });
  });
  it("blocks foreign tenants and ineligible contacts", async () => {
    await expect(previewVscEmailDraft("20000000-0000-0000-0000-000000000002", input)).rejects.toThrow(); expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValue({ data: [], error: null }); await expect(previewVscEmailDraft(tenant, input)).rejects.toThrow("éligible");
  });
  it("requires re-review after a changed recipient or input", async () => {
    const preview = await previewVscEmailDraft(tenant, input);
    rpc.mockResolvedValue({ data: [{ id: person, display_name: "Fixture", primary_email: "changed@example.invalid" }], error: null });
    await expect(saveVscEmailDraft(tenant, input, preview.reviewKey)).rejects.toThrow("aperçu");
    expect(rpc.mock.calls.every(call => call[0] === "vsc_email_draft_contacts")).toBe(true);
  });
  it("saves only the server-generated selection through the atomic draft RPC", async () => {
    const preview = await previewVscEmailDraft(tenant, input);
    rpc.mockImplementation(async (name: string) => name === "vsc_email_draft_contacts" ? { data: preview.contacts, error: null } : { data: { campaignId: input.campaignId, submitted: 2, reused: false }, error: null });
    expect((await saveVscEmailDraft(tenant, input, preview.reviewKey)).submitted).toBe(2);
    expect(rpc).toHaveBeenCalledWith("vsc_create_email_draft", { p_tenant_id: tenant, p_campaign_id: input.campaignId, p_name: input.name, p_start_date: input.startDate, p_person_ids: [person] });
  });
});
