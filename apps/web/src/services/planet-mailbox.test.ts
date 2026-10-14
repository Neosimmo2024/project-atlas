import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), fetchHeaders: vi.fn(), fetchBody: vi.fn(),
  connect: vi.fn(), open: vi.fn(), search: vi.fn(), logout: vi.fn(), process: vi.fn(), options: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service-role", () => ({ createSupabaseServiceRoleClient: () => ({ rpc: m.rpc, from: m.from }) }));
vi.mock("./recruitment-inbound-replies", () => ({ processBrevoInboundReplies: m.process }));
vi.mock("./reply-sms-alerts", () => ({ dispatchReplySmsAlerts: vi.fn() }));
vi.mock("imapflow", () => ({ ImapFlow: class {
  constructor(options: unknown) { m.options(options); }
  connect = m.connect; mailboxOpen = m.open; search = m.search; fetch = m.fetchHeaders;
  fetchOne = m.fetchBody; logout = m.logout;
} }));
import { syncMailbox } from "./planet-mailbox";
beforeEach(() => {
  vi.resetAllMocks();
  m.rpc.mockImplementation(async (name: string) => name === "get_vault_secret_value"
    ? { data: JSON.stringify({ password: "fixture", enabled: true, validity: "1", cursor: 0 }) }
    : { error: null });
  m.connect.mockResolvedValue(undefined); m.open.mockResolvedValue({ uidValidity: BigInt(1) }); m.logout.mockResolvedValue(undefined);
  m.from.mockImplementation(() => {
    const q: Record<string, unknown> = {};
    for (const method of ["select", "eq", "not", "contains", "order"]) q[method] = vi.fn(() => q);
    q.range = vi.fn(async () => ({ data: [], error: null }));
    return q;
  });
});
describe("mailbox backfill batching", () => {
  it("reads 520 headers in one command and preserves unprocessed history", async () => {
    m.search.mockResolvedValueOnce(Array.from({ length: 700 }, (_, i) => i + 1)).mockResolvedValueOnce([]);
    m.fetchHeaders.mockImplementation(async function* (uids: number[]) {
      for (const uid of [...uids].sort((a, b) => a - b)) yield { uid, headers: Buffer.from(`Message-ID: <${uid}@example.org>\r\n\r\n`), size: 50 };
    });
    const result = await syncMailbox("tenant-fixture");
    expect(result).toMatchObject({ scanned: 520, remaining: 200, processed: 0 });
    expect(m.fetchHeaders).toHaveBeenCalledOnce();
    expect(m.fetchBody).not.toHaveBeenCalled();
    expect(m.process).not.toHaveBeenCalled();
    const persisted = m.rpc.mock.calls.find(([name]) => name === "set_vault_secret_value")![1];
    expect(JSON.parse(persisted.p_value)).toMatchObject({ cursor: 500, remaining: 200 });
    expect(m.open).toHaveBeenCalledWith("INBOX", { readOnly: true });
    expect(m.options).toHaveBeenCalledWith(expect.objectContaining({ secure: true, logger: false, tls: { rejectUnauthorized: true } }));
  });
  it("fails closed on a failed header stream without advancing the cursor", async () => {
    m.search.mockResolvedValue([1, 2]);
    m.fetchHeaders.mockImplementation(async function* () { yield { uid: 1 }; throw new Error("fixture connection failure"); });
    await expect(syncMailbox("tenant-fixture")).rejects.toThrow("Synchronisation indisponible");
    const persisted = m.rpc.mock.calls.find(([name]) => name === "set_vault_secret_value")![1];
    expect(JSON.parse(persisted.p_value).cursor).toBe(0);
    expect(m.process).not.toHaveBeenCalled();
  });
});
