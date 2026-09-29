import { expect, it, vi } from "vitest";
import { ensureBrevoPilotChannels as run } from "./brevo-pilot-channels";
const tenant = "11111111-1111-4111-8111-111111111111";
const externalId = `atlas:${tenant}:22222222-2222-4222-8222-222222222222`;
const email = "pilot@example.invalid", sender = "sender@example.com";
function setup(initiallyBlocked = false) {
  let blocked = initiallyBlocked;
  const state = { id: 334, ext_id: externalId, email, emailBlacklisted: true, smsBlacklisted: false, attributes: {} as Record<string, unknown> };
  const authorize = vi.fn<() => Promise<void>>().mockResolvedValue();
  const transport = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
    if (init?.method === "PUT") { blocked = true; return new Response(null, { status: 204 }); }
    const body = String(url).includes("/senders") ? { senders: [{ email: sender }] }
      : String(url).includes("/smtp/blockedContacts") ? { count: blocked ? 1 : 0, contacts: blocked ? [{ email, senderEmail: sender }] : [] }
      : state;
    return new Response(JSON.stringify(body));
  });
  return { state, transport, authorize, o: { enabled: true, apiKey: "fixture", accountTenantId: tenant, externalId, contactId: 334, email, authorize, transport } };
}
it("automatically restricts the existing contact and independently rereads its sender blocks", async () => {
  const { o, transport } = setup();
  expect(await run(o)).toEqual({ status: "verified", contactId: 334, senderCount: 1, sms: "not_configured" });
  const writes = transport.mock.calls.filter(c => c[1]?.method === "PUT");
  expect(writes).toHaveLength(1);
  expect(JSON.parse(writes[0][1]!.body as string)).toEqual({ emailBlacklisted: true, smtpBlacklistSender: [sender] });
  expect(transport.mock.calls.every(([url, init]) => String(url).startsWith("https://api.brevo.com/v3/") && ["GET", "PUT"].includes(init!.method!))).toBe(true);
  expect(writes[0][0]).toContain(`contacts/${encodeURIComponent(externalId)}?identifierType=ext_id`);
});
it("second execution does not write or create anything", async () => {
  const { o, transport } = setup(); await run(o); transport.mockClear();
  expect((await run(o)).status).toBe("verified");
  expect(transport.mock.calls.every(c => c[1]?.method === "GET")).toBe(true);
});
it("includes global blocks while matching only the exact recipient", async () => {
  const { o, transport } = setup(true); const base = transport.getMockImplementation()!;
  transport.mockImplementation((url, init) => String(url).includes("blockedContacts")
    ? Promise.resolve(new Response(JSON.stringify({ count: 1, contacts: [{ email, senderEmail: null }] }))) : base(url, init));
  expect((await run(o)).status).toBe("verified"); expect(transport.mock.calls.every(c => c[1]?.method === "GET")).toBe(true);
  expect(transport.mock.calls.filter(c => String(c[0]).includes("blockedContacts")).every(c => !String(c[0]).includes("senders="))).toBe(true);
});
it.each([{ id: 335 }, { email: "other@example.invalid" }, { ext_id: "foreign" }, { attributes: { SMS: "+33600000000" } }, { attributes: null }])("fails closed on identity or phone changes %j", async change => {
  const { o, state, transport } = setup(); Object.assign(state, change);
  expect((await run(o)).status).toBe("channels_unconfirmed"); expect(transport.mock.calls.some(c => c[1]?.method === "PUT")).toBe(false);
});
it.each([{ enabled: false }, { apiKey: "" }, { email: "real@example.com" }, { accountTenantId: "foreign" }, { contactId: 0 }])("rejects invalid configuration %j", async change => {
  const { o, transport } = setup(); expect((await run({ ...o, ...change })).status).toBe("channels_unconfirmed"); expect(transport).not.toHaveBeenCalled();
});
it("does not write after authorization is revoked", async () => {
  const { o, authorize, transport } = setup(); authorize.mockRejectedValue(new Error("revoked"));
  expect((await run(o)).status).toBe("channels_unconfirmed"); expect(transport).not.toHaveBeenCalled();
});
it("does not retry an uncertain write", async () => {
  const { o, transport } = setup(); const base = transport.getMockImplementation()!;
  transport.mockImplementation((url, init) => init?.method === "PUT" ? Promise.reject(new Error("timeout")) : base(url, init));
  expect((await run(o)).status).toBe("channels_unconfirmed"); expect(transport.mock.calls.filter(c => c[1]?.method === "PUT")).toHaveLength(1);
});
it("does not treat an acknowledged write as a verified block", async () => {
  const { o, transport } = setup(); const base = transport.getMockImplementation()!;
  transport.mockImplementation((url, init) => init?.method === "PUT" ? Promise.resolve(new Response(null, { status: 204 })) : base(url, init));
  expect((await run(o)).status).toBe("channels_unconfirmed");
});
it("fails closed when the blocklist cannot be read", async () => {
  const { o, transport } = setup(); const base = transport.getMockImplementation()!;
  transport.mockImplementation((url, init) => String(url).includes("blockedContacts") ? Promise.resolve(new Response("{}", { status: 429 })) : base(url, init));
  expect((await run(o)).status).toBe("channels_unconfirmed"); expect(transport.mock.calls.some(c => c[1]?.method === "PUT")).toBe(false);
});
