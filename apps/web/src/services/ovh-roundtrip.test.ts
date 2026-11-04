import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { TenantContext } from "@/types/domain";
const m = vi.hoisted(() => ({ connect: vi.fn(), mailboxOpen: vi.fn(), search: vi.fn(), fetch: vi.fn(), close: vi.fn(), sendMail: vi.fn(), transportClose: vi.fn(), constructor: vi.fn() }));
vi.mock("imapflow", () => ({ ImapFlow: class { constructor(o: unknown) { m.constructor(o); } on() {} connect = m.connect; mailboxOpen = m.mailboxOpen; search = m.search; fetch = m.fetch; close = m.close; } }));
vi.mock("./ovh-connection", async original => ({ ...await original<typeof import("./ovh-connection")>(), createOvhTransport: () => ({ sendMail: m.sendMail, close: m.transportClose }) }));
import { verifyOvhRoundtrip } from "./ovh-roundtrip";
const tenantId = "11111111-1111-4111-8111-111111111111";
const context = { tenantId, role: "owner" } as TenantContext;
const sender = "contact@vendresoncommerce.com";
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("VSC_OVH_TENANT_ID", tenantId); vi.stubEnv("VSC_OVH_SMTP_PASSWORD", "secret"); m.connect.mockResolvedValue(undefined); m.mailboxOpen.mockResolvedValue({}); m.sendMail.mockResolvedValue({ accepted: [sender] }); m.search.mockResolvedValue([1]); });
afterEach(() => vi.unstubAllEnvs());
it("blocks wrong tenant before I/O", async () => {
  expect((await verifyOvhRoundtrip({ ...context, tenantId: "other" })).success).toBe(false);
  expect(m.constructor).not.toHaveBeenCalled(); expect(m.sendMail).not.toHaveBeenCalled();
});
it("validates exact received message and closes both connections", async () => {
  m.fetch.mockImplementation(async function* () { yield { envelope: { messageId: m.sendMail.mock.calls[0][0].messageId, from: [{ address: sender }], to: [{ address: sender }] } }; });
  expect((await verifyOvhRoundtrip(context)).success).toBe(true);
  expect(m.mailboxOpen).toHaveBeenCalledWith("INBOX", { readOnly: true });
  expect(m.sendMail).toHaveBeenCalledOnce();
  expect(m.sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: sender, replyTo: sender }));
  expect(m.close).toHaveBeenCalled(); expect(m.transportClose).toHaveBeenCalled();
});
it("does not send when IMAP fails, and redacts errors", async () => {
  m.connect.mockRejectedValue(new Error("secret"));
  const result = await verifyOvhRoundtrip(context);
  expect(result.success).toBe(false); expect(JSON.stringify(result)).not.toContain("secret"); expect(m.sendMail).not.toHaveBeenCalled(); expect(m.close).toHaveBeenCalled();
});
it("does not retry ambiguous SMTP failures", async () => {
  m.sendMail.mockRejectedValue(new Error("secret"));
  expect((await verifyOvhRoundtrip(context)).success).toBe(false);
  expect(m.sendMail).toHaveBeenCalledOnce(); expect(m.transportClose).toHaveBeenCalled(); expect(m.close).toHaveBeenCalled();
});
it("does not equate failed search with receipt", async () => {
  m.search.mockResolvedValue(false);
  expect((await verifyOvhRoundtrip(context)).success).toBe(false); expect(m.fetch).not.toHaveBeenCalled();
});
