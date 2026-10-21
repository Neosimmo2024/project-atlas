import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBrevoContactJournal } from "./brevo-contact-journal";

const mocks = vi.hoisted(() => ({ context: vi.fn(), client: vi.fn(), from: vi.fn(), insert: vi.fn(), update: vi.fn(), eq: vi.fn(), select: vi.fn(), single: vi.fn() }));
vi.mock("./tenant-context", () => ({ getTenantContext: mocks.context }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.client }));
const tenantId = "11111111-1111-4111-8111-111111111111", personId = "22222222-2222-4222-8222-222222222222";
const id = "33333333-3333-4333-8333-333333333333", userId = "user-a";
const actor = { tenantId, userId, role: "owner" };
const denied = /^BREVO_CONTACT_JOURNAL_UNAVAILABLE$/;
beforeEach(() => {
  vi.resetAllMocks(); mocks.context.mockResolvedValue({ ...actor });
  mocks.client.mockResolvedValue({ from: mocks.from });
  const query = { insert: mocks.insert, update: mocks.update, eq: mocks.eq, select: mocks.select, single: mocks.single };
  for (const fn of [mocks.from, mocks.insert, mocks.update, mocks.eq, mocks.select]) fn.mockReturnValue(query);
  mocks.single.mockResolvedValue({ data: { id }, error: null });
});

describe("persistent contact journal with mocked database", () => {
  it("starts with only actor, tenant and person identifiers", async () => {
    const journal = await createBrevoContactJournal();
    expect(await journal.begin({ tenantId, personId })).toBe(id);
    expect(mocks.insert).toHaveBeenCalledWith({ tenant_id: tenantId, user_id: userId, person_id: personId });
    expect(mocks.context).toHaveBeenCalledTimes(2);
  });
  it("finishes only the actor's pending attempt", async () => {
    const journal = await createBrevoContactJournal();
    await journal.finish(id, { status: "created", contactId: 45 });
    expect(mocks.update).toHaveBeenCalledWith({ status: "created", result_code: null, provider_contact_id: 45 });
    expect(mocks.eq.mock.calls).toEqual([["id", id], ["tenant_id", tenantId], ["user_id", userId], ["status", "pending"]]);
  });
  it.each([null, { ...actor, role: "reader" }, { ...actor, role: "recruiter" }, { ...actor, role: "manager" }])("rejects unauthorized context: %o", async context => {
    mocks.context.mockResolvedValue(context);
    await expect(createBrevoContactJournal()).rejects.toThrow(denied); expect(mocks.client).not.toHaveBeenCalled();
  });
  it("accepts admin context", async () => {
    mocks.context.mockResolvedValue({ ...actor, role: "admin" });
    expect(await (await createBrevoContactJournal()).begin({ tenantId, personId })).toBe(id);
  });
  it("rejects another target tenant", async () => {
    const journal = await createBrevoContactJournal();
    await expect(journal.begin({ tenantId: "foreign", personId })).rejects.toThrow(denied);
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it.each([null, { ...actor, role: "reader" }, { ...actor, tenantId: "foreign" }, { ...actor, userId: "other-user" }])("rechecks actor on completion: %o", async context => {
    const journal = await createBrevoContactJournal(); mocks.context.mockResolvedValue(context);
    await expect(journal.finish(id, { status: "created", contactId: 45 })).rejects.toThrow(denied);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("sanitizes unknown reasons before persistence", async () => {
    const journal = await createBrevoContactJournal();
    await journal.finish(id, { status: "failed", reason: "sensitive provider details" });
    expect(mocks.update).toHaveBeenCalledWith({ status: "failed", result_code: "unclassified", provider_contact_id: null });
  });
  it.each([undefined, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid success identifier: %s", async contactId => {
    const journal = await createBrevoContactJournal();
    await expect(journal.finish(id, { status: "created", contactId })).rejects.toThrow(denied);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("does not complete a disabled invocation", async () => {
    await expect((await createBrevoContactJournal()).finish(id, { status: "disabled" })).rejects.toThrow(denied);
  });
  it.each([{ data: null, error: null }, { data: null, error: { message: "private details" } }])("requires a confirmed database write: %o", async response => {
    const journal = await createBrevoContactJournal(); mocks.single.mockResolvedValue(response);
    await expect(journal.begin({ tenantId, personId })).rejects.toThrow(denied);
    await expect(journal.finish(id, { status: "failed", reason: "provider_rejected" })).rejects.toThrow(denied);
  });
});
