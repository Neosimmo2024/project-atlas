import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthorizedBrevoContactSource } from "./brevo-contact-source";
import { syncBrevoContact } from "@/services/brevo-contact-sync";

const mocks = vi.hoisted(() => ({ context: vi.fn(), client: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), single: vi.fn() }));
vi.mock("./tenant-context", () => ({ getTenantContext: mocks.context }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.client }));
const tenantId = "11111111-1111-4111-8111-111111111111";
const personId = "22222222-2222-4222-8222-222222222222";
const context = { tenantId, userId: "user-a", role: "owner" };
const person = { id: personId, tenant_id: tenantId, primary_email: "person@example.invalid", contact_allowed: true, do_not_contact: false };
const denied = /^BREVO_CONTACT_SOURCE_UNAVAILABLE$/;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Real network forbidden"); }));
  mocks.context.mockResolvedValue({ ...context });
  mocks.client.mockResolvedValue({ from: mocks.from });
  const query = { select: mocks.select, eq: mocks.eq, maybeSingle: mocks.single };
  mocks.from.mockReturnValue(query); mocks.select.mockReturnValue(query); mocks.eq.mockReturnValue(query);
  mocks.single.mockResolvedValue({ data: { ...person }, error: null });
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

describe("authorized Brevo contact source (mocked database)", () => {
  it.each(["owner", "admin"])("uses the authenticated tenant and narrow RLS query for %s", async role => {
    mocks.context.mockResolvedValue({ ...context, role });
    const source = await createAuthorizedBrevoContactSource(personId);
    expect(source.target).toEqual({ tenantId, personId });
    expect(await source.readPerson(source.target)).toEqual({ tenantId, personId, email: person.primary_email, contactAllowed: true, doNotContact: false });
    expect(mocks.context).toHaveBeenCalledTimes(2);
    expect(mocks.from).toHaveBeenCalledWith("people");
    expect(mocks.select).toHaveBeenCalledWith("id, tenant_id, primary_email, contact_allowed, do_not_contact");
    expect(mocks.eq.mock.calls).toEqual([["tenant_id", tenantId], ["id", personId]]);
  });
  it.each([null, { ...context, role: "reader" }, { ...context, role: "recruiter" }, { ...context, role: "manager" }])("rejects missing or non-admin membership: %o", async value => {
    mocks.context.mockResolvedValue(value);
    await expect(createAuthorizedBrevoContactSource(personId)).rejects.toThrow(denied);
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("rejects malformed person identifiers before accessing the session", async () => {
    await expect(createAuthorizedBrevoContactSource("invalid")).rejects.toThrow(denied);
    expect(mocks.context).not.toHaveBeenCalled();
  });
  it.each([{ tenantId: "foreign", personId }, { tenantId, personId: "33333333-3333-4333-8333-333333333333" }])("rejects a redirected target: %o", async target => {
    const source = await createAuthorizedBrevoContactSource(personId);
    await expect(source.readPerson(target)).rejects.toThrow(denied);
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it.each([null, { ...context, role: "reader" }, { ...context, tenantId: "foreign" }, { ...context, userId: "other-user" }])("rechecks authorization after the adapter is created: %o", async changed => {
    const source = await createAuthorizedBrevoContactSource(personId);
    mocks.context.mockResolvedValue(changed);
    await expect(source.readPerson(source.target)).rejects.toThrow(denied);
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("reads fresh withdrawal flags on successive calls", async () => {
    const source = await createAuthorizedBrevoContactSource(personId);
    expect((await source.readPerson(source.target))?.doNotContact).toBe(false);
    mocks.single.mockResolvedValue({ data: { ...person, do_not_contact: true, contact_allowed: false }, error: null });
    expect(await source.readPerson(source.target)).toMatchObject({ doNotContact: true, contactAllowed: false });
    expect(mocks.context).toHaveBeenCalledTimes(3);
  });
  it("returns null for a missing or RLS-hidden person", async () => {
    mocks.single.mockResolvedValue({ data: null, error: null });
    const source = await createAuthorizedBrevoContactSource(personId);
    expect(await source.readPerson(source.target)).toBeNull();
  });
  it.each([{ ...person, tenant_id: "foreign" }, { ...person, id: "foreign" }, { ...person, contact_allowed: null }, { ...person, do_not_contact: null }, { ...person, primary_email: undefined }])("fails closed for inconsistent source data: %o", async data => {
    mocks.single.mockResolvedValue({ data, error: null });
    const source = await createAuthorizedBrevoContactSource(personId);
    await expect(source.readPerson(source.target)).rejects.toThrow(denied);
  });
  it("redacts database errors instead of treating them as missing contacts", async () => {
    mocks.single.mockResolvedValue({ data: null, error: { message: "private database details" } });
    const source = await createAuthorizedBrevoContactSource(personId);
    await expect(source.readPerson(source.target)).rejects.toThrow(denied);
  });
  it("redacts session lookup errors", async () => {
    mocks.context.mockRejectedValue(new Error("private session details"));
    await expect(createAuthorizedBrevoContactSource(personId)).rejects.toThrow(denied);
  });
  it("does not let mutation of the returned target change the bound identity", async () => {
    const source = await createAuthorizedBrevoContactSource(personId);
    source.target.tenantId = "foreign";
    await expect(source.readPerson(source.target)).rejects.toThrow(denied);
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("blocks the executor write when membership is revoked during provider lookup", async () => {
    const source = await createAuthorizedBrevoContactSource(personId);
    const transport = vi.fn<typeof fetch>().mockImplementation(async () => {
      mocks.context.mockResolvedValue(null);
      return new Response(JSON.stringify({ code: "document_not_found" }), { status: 404 });
    });
    expect(await syncBrevoContact(source.target, { enabled: true, accountTenantId: tenantId,
      apiKey: "mock-key-never-real", readPerson: source.readPerson, transport }))
      .toEqual({ status: "failed", reason: "source_or_lookup_failed" });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][1]?.method).toBe("GET");
  });
});
