import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/types/domain";
const mocks = vi.hoisted(() => ({ constructor: vi.fn(), connect: vi.fn(), mailboxOpen: vi.fn(), search: vi.fn(), fetch: vi.fn(), close: vi.fn() }));
vi.mock("imapflow", () => ({ ImapFlow: class {
  constructor(options: unknown) { mocks.constructor(options); }
  connect = mocks.connect; mailboxOpen = mocks.mailboxOpen; search = mocks.search; fetch = mocks.fetch; close = mocks.close;
  on() { return this; }
} }));
import { verifyIonosTestReply } from "./ionos-reply-test";
const tenantId = "11111111-1111-4111-8111-111111111111";
const context = { tenantId, role: "owner" } as TenantContext;
const reference = `<atlas-ionos-${tenantId}-delivery-signature-v3@lesformateursimmo.com>`;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("LFI_IONOS_TENANT_ID", tenantId);
  vi.stubEnv("LFI_IONOS_SMTP_PASSWORD", " private ");
  mocks.connect.mockResolvedValue(undefined); mocks.mailboxOpen.mockResolvedValue({}); mocks.search.mockResolvedValue([]);
});
afterEach(() => vi.unstubAllEnvs());
describe("IONOS reply diagnostic", () => {
  it("rejects a different tenant before opening the mailbox", async () => {
    expect((await verifyIonosTestReply({ ...context, tenantId: "other" })).success).toBe(false);
    expect(mocks.constructor).not.toHaveBeenCalled();
  });
  it("connects securely and read-only, distinguishes no reply from failure", async () => {
    expect(await verifyIonosTestReply(context)).toMatchObject({ success: true, replyFound: false });
    expect(mocks.constructor).toHaveBeenCalledWith(expect.objectContaining({ host: "imap.ionos.fr", secure: true, logger: false, auth: { user: "contact@lesformateursimmo.com", pass: " private " } }));
    expect(mocks.mailboxOpen).toHaveBeenCalledWith("INBOX", { readOnly: true });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalled();
  });
  it("only accepts the exact signed test reference and sender", async () => {
    mocks.search.mockResolvedValue([12]);
    mocks.fetch.mockImplementation(async function* () { yield { envelope: { inReplyTo: reference, from: [{ address: "renatoponzio@gmail.com" }] } }; });
    expect(await verifyIonosTestReply(context)).toMatchObject({ success: true, replyFound: true });
    expect(mocks.fetch).toHaveBeenCalledWith([12], { envelope: true }, { uid: true });
    mocks.fetch.mockImplementation(async function* () { yield { envelope: { inReplyTo: reference + "wrong", from: [{ address: "renatoponzio@gmail.com" }] } }; });
    expect(await verifyIonosTestReply(context)).toMatchObject({ replyFound: false });
  });
  it("redacts mailbox failures and closes", async () => {
    mocks.connect.mockRejectedValue(new Error(" private credential "));
    const result = await verifyIonosTestReply(context);
    expect(result.success).toBe(false); expect(JSON.stringify(result)).not.toContain("credential");
    expect(mocks.close).toHaveBeenCalled();
  });
  it("does not treat failed search as a successful empty result", async () => {
    mocks.search.mockResolvedValue(false);
    expect((await verifyIonosTestReply(context)).success).toBe(false);
  });
});
