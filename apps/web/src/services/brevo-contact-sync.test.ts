import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncBrevoContact } from "./brevo-contact-sync";

const tenantId = "11111111-1111-4111-8111-111111111111";
const personId = "22222222-2222-4222-8222-222222222222";
const target = { tenantId, personId };
const person = { ...target, email: "candidate@example.invalid", contactAllowed: true, doNotContact: false };
const externalId = `atlas:${tenantId}:${personId}`;
const contact = { id: 12, email: person.email, emailBlacklisted: false, smsBlacklisted: false };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const missing = () => json(404, { code: "document_not_found" });
let transport: ReturnType<typeof vi.fn<typeof fetch>>;
let readPerson: ReturnType<typeof vi.fn<() => Promise<typeof person | null>>>;
const options = () => ({ enabled: true, accountTenantId: tenantId, apiKey: "mock-key-never-real", transport, readPerson });
const writes = () => transport.mock.calls.filter(([, init]) => init?.method !== "GET");
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Real network forbidden"); }));
  transport = vi.fn<typeof fetch>().mockRejectedValue(new Error("Unexpected call"));
  readPerson = vi.fn<() => Promise<typeof person | null>>().mockResolvedValue({ ...person });
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

describe("Brevo contact executor with mocked transport", () => {
  it("is disabled by default without reading source or provider", async () => {
    expect(await syncBrevoContact(target, { ...options(), enabled: undefined })).toEqual({ status: "disabled" });
    expect(transport).not.toHaveBeenCalled(); expect(readPerson).not.toHaveBeenCalled();
  });
  it.each(["other", "33333333-3333-4333-8333-333333333333"])("blocks an invalid or foreign tenant: %s", async accountTenantId => {
    expect((await syncBrevoContact(target, { ...options(), accountTenantId })).status).toBe("blocked");
    expect(transport).not.toHaveBeenCalled(); expect(readPerson).not.toHaveBeenCalled();
  });
  it("blocks missing credentials", async () => {
    expect(await syncBrevoContact(target, { ...options(), apiKey: " " })).toEqual({ status: "blocked", reason: "missing_configuration" });
    expect(readPerson).not.toHaveBeenCalled(); expect(transport).not.toHaveBeenCalled();
  });
  it.each([null, { ...person, personId: "33333333-3333-4333-8333-333333333333" }])("rejects an absent or mismatched source: %o", async source => {
    readPerson.mockResolvedValue(source);
    expect((await syncBrevoContact(target, options())).status).toBe("failed"); expect(transport).not.toHaveBeenCalled();
  });
  it("checks both identities, rechecks permission, then creates without merge or subscriptions", async () => {
    transport.mockResolvedValueOnce(missing()).mockResolvedValueOnce(missing()).mockResolvedValueOnce(json(201, { id: 99 }));
    expect(await syncBrevoContact(target, options())).toEqual({ status: "created", contactId: 99 });
    expect(readPerson).toHaveBeenCalledTimes(3);
    expect(transport.mock.calls[0][0]).toBe(`https://api.brevo.com/v3/contacts/${encodeURIComponent(externalId)}?identifierType=ext_id`);
    expect(transport.mock.calls[1][0]).toBe(`https://api.brevo.com/v3/contacts/${encodeURIComponent(person.email)}?identifierType=email_id`);
    const [url, init] = writes()[0];
    expect(url).toBe("https://api.brevo.com/v3/contacts");
    expect(init).toMatchObject({ method: "POST", redirect: "error", cache: "no-store" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(init?.body))).toEqual({ email: person.email, ext_id: externalId, updateEnabled: false, forceMerge: false });
  });
  it("does not adopt an existing contact found by email", async () => {
    transport.mockResolvedValueOnce(missing()).mockResolvedValueOnce(json(200, contact));
    expect(await syncBrevoContact(target, options())).toEqual({ status: "blocked", reason: "email_collision" }); expect(writes()).toEqual([]);
  });
  it("preserves provider opt-out for a linked contact", async () => {
    transport.mockResolvedValueOnce(json(200, { ...contact, emailBlacklisted: true }));
    expect(await syncBrevoContact(target, options())).toEqual({ status: "skipped", reason: "already_linked" }); expect(writes()).toEqual([]);
  });
  it("applies withdrawal to the known provider id", async () => {
    readPerson.mockResolvedValue({ ...person, doNotContact: true });
    transport.mockResolvedValueOnce(json(200, contact)).mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect(await syncBrevoContact(target, options())).toEqual({ status: "suppressed", contactId: 12 });
    expect(writes()[0][0]).toBe("https://api.brevo.com/v3/contacts/12?identifierType=contact_id");
    expect(JSON.parse(String(writes()[0][1]?.body))).toEqual({ emailBlacklisted: true, smsBlacklisted: true });
  });
  it("rechecks source withdrawal after reading the provider", async () => {
    readPerson.mockResolvedValueOnce(person).mockResolvedValueOnce({ ...person, contactAllowed: false });
    transport.mockResolvedValueOnce(json(200, contact)).mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect((await syncBrevoContact(target, options())).status).toBe("suppressed");
  });
  it.each([{ ...person, doNotContact: true }, { ...person, email: "changed@example.invalid" }])("blocks source changes during collision lookup: %o", async changed => {
    readPerson.mockResolvedValueOnce(person).mockResolvedValueOnce(person).mockResolvedValueOnce(changed);
    transport.mockResolvedValueOnce(missing()).mockResolvedValueOnce(missing());
    expect(await syncBrevoContact(target, options())).toEqual({ status: "blocked", reason: "source_changed" }); expect(writes()).toEqual([]);
  });
  it("skips a withdrawn contact absent from Brevo", async () => {
    readPerson.mockResolvedValue({ ...person, doNotContact: true }); transport.mockResolvedValueOnce(missing());
    expect(await syncBrevoContact(target, options())).toEqual({ status: "skipped", reason: "contact_not_allowed" }); expect(writes()).toEqual([]);
  });
  it.each([401, 429, 500])("does not turn HTTP %s lookup errors into a creation", async status => {
    transport.mockResolvedValueOnce(json(status, { message: "sensitive-provider-details" }));
    expect(await syncBrevoContact(target, options())).toEqual({ status: "failed", reason: "source_or_lookup_failed" }); expect(writes()).toEqual([]);
  });
  it("does not treat arbitrary 404 responses as absence", async () => {
    transport.mockResolvedValueOnce(json(404, { code: "other" }));
    expect((await syncBrevoContact(target, options())).status).toBe("failed"); expect(writes()).toEqual([]);
  });
  it.each([{ ...contact, id: 0 }, { ...contact, ext_id: "foreign" }, { id: 12 }])("rejects malformed or contradictory provider snapshots: %o", async body => {
    transport.mockResolvedValueOnce(json(200, body));
    expect((await syncBrevoContact(target, options())).status).toBe("failed"); expect(writes()).toEqual([]);
  });
  it("does not leak network errors", async () => {
    transport.mockRejectedValueOnce(new Error("secret and contact details"));
    expect(await syncBrevoContact(target, options())).toEqual({ status: "failed", reason: "source_or_lookup_failed" });
  });
  it("does not retry a rejected create or force an update", async () => {
    transport.mockResolvedValueOnce(missing()).mockResolvedValueOnce(missing()).mockResolvedValueOnce(json(400, { code: "duplicate_parameter" }));
    expect(await syncBrevoContact(target, options())).toEqual({ status: "failed", reason: "provider_rejected" }); expect(writes()).toHaveLength(1);
  });
  it.each([json(500, {}), json(201, {}), json(200, { id: 1 })])("requires reconciliation on ambiguous write response", async response => {
    transport.mockResolvedValueOnce(missing()).mockResolvedValueOnce(missing()).mockResolvedValueOnce(response);
    expect(await syncBrevoContact(target, options())).toEqual({ status: "write_outcome_unknown", reason: "reconcile_before_retry" }); expect(writes()).toHaveLength(1);
  });
  it("requires reconciliation on write timeout instead of retrying", async () => {
    transport.mockResolvedValueOnce(missing()).mockResolvedValueOnce(missing()).mockRejectedValueOnce(new Error("timeout with sensitive details"));
    expect(await syncBrevoContact(target, options())).toEqual({ status: "write_outcome_unknown", reason: "reconcile_before_retry" }); expect(writes()).toHaveLength(1);
  });
});
