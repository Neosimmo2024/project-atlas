import { beforeEach, describe, expect, it, vi } from "vitest";
const { connect, lock, release, fetch, logout, close, on, mailbox } = vi.hoisted(() => ({ connect: vi.fn(), lock: vi.fn(), release: vi.fn(), fetch: vi.fn(), logout: vi.fn(), close: vi.fn(), on: vi.fn(), mailbox: { uidValidity: BigInt(42), uidNext: 401 } }));
vi.mock("imapflow", () => ({ ImapFlow: class { connect = connect; getMailboxLock = lock; fetch = fetch; logout = logout; close = close; on = on; mailbox = mailbox; } }));
import { inspectVscInboxBatch } from "./vsc-ovh-imap";
describe("VSC read-only UID collector", () => {
  beforeEach(() => {
    vi.resetAllMocks(); process.env.VSC_OVH_IMAP_PASSWORD = "synthetic-password";
    mailbox.uidValidity = BigInt(42); mailbox.uidNext = 401;
    connect.mockResolvedValue(undefined); lock.mockResolvedValue({ release }); logout.mockResolvedValue(undefined);
    fetch.mockImplementation(async function* () {
      yield { envelope: { messageId: "<reply@example.com>", from: [{ address: "shop@example.com" }], date: new Date("2000-01-01") },
        internalDate: new Date("2026-10-28T09:00:00Z"), headers: Buffer.from("References: <sent@example.com>\r\n") };
    });
  });
  it("uses read-only UID ranges and the server receipt date", async () => {
    const result = await inspectVscInboxBatch({ uidValidity: "42", lastUid: 200, version: 1 });
    expect(lock).toHaveBeenCalledWith("INBOX", { readOnly: true }); expect(fetch.mock.calls[0][0]).toBe("201:400"); expect(fetch.mock.calls[0][2]).toEqual({ uid: true });
    expect(result.envelopes[0].receivedAt).toBe("2026-10-28T09:00:00.000Z"); expect(result.lastUid).toBe(400); expect(release).toHaveBeenCalled(); expect(logout).toHaveBeenCalled();
  });
  it("closes a session even when authentication fails", async () => {
    connect.mockRejectedValue(new Error("auth failed"));
    await expect(inspectVscInboxBatch({ uidValidity: "42", lastUid: 0, version: 1 })).rejects.toThrow("auth failed");
    expect(close).toHaveBeenCalled();
  });
  it("rejects a silently truncated fetch after a connection error", async () => {
    fetch.mockImplementation(async function* () {
      on.mock.calls.find(call => call[0] === "error")![1](new Error("connection lost"));
    });
    await expect(inspectVscInboxBatch({ uidValidity: "42", lastUid: 0, version: 1 })).rejects.toThrow("interrompue");
    expect(close).toHaveBeenCalled();
  });
  it("does not refetch the last message when caught up", async () => {
    await inspectVscInboxBatch({ uidValidity: "42", lastUid: 400, version: 1 }); expect(fetch).not.toHaveBeenCalled();
  });
  it("releases the mailbox lock after an interrupted fetch", async () => {
    fetch.mockImplementation(async function* () { throw new Error("disconnected"); });
    await expect(inspectVscInboxBatch({ uidValidity: "42", lastUid: 0, version: 1 })).rejects.toThrow("disconnected"); expect(release).toHaveBeenCalled(); expect(logout).toHaveBeenCalled();
  });
});
