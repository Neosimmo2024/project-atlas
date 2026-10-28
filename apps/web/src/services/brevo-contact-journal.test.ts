import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncBrevoContactWithJournal } from "./brevo-contact-journal";

const mocks = vi.hoisted(() => ({ sync: vi.fn() }));
vi.mock("./brevo-contact-sync", () => ({ syncBrevoContact: mocks.sync }));
const target = { tenantId: "11111111-1111-4111-8111-111111111111", personId: "22222222-2222-4222-8222-222222222222" };
const attemptId = "33333333-3333-4333-8333-333333333333";
const begin = vi.fn(); const finish = vi.fn(); const readPerson = vi.fn();
const options = () => ({ enabled: true, accountTenantId: target.tenantId, apiKey: "mock", readPerson, journal: { begin, finish } });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Real network forbidden"); }));
  begin.mockResolvedValue(attemptId); finish.mockResolvedValue(undefined);
  mocks.sync.mockResolvedValue({ status: "created", contactId: 45 });
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

describe("journaled contact execution", () => {
  it("does nothing when disabled", async () => {
    expect(await syncBrevoContactWithJournal(target, { ...options(), enabled: undefined })).toEqual({ status: "disabled" });
    expect(begin).not.toHaveBeenCalled(); expect(mocks.sync).not.toHaveBeenCalled(); expect(finish).not.toHaveBeenCalled();
  });
  it("requires persisted start before execution and saves only the outcome", async () => {
    const events: string[] = [];
    begin.mockImplementation(async () => { events.push("persist-start"); return attemptId; });
    mocks.sync.mockImplementation(async () => { events.push("execute"); return { status: "created", contactId: 45 }; });
    finish.mockImplementation(async () => { events.push("persist-result"); });
    expect(await syncBrevoContactWithJournal(target, options())).toEqual({ status: "created", contactId: 45, attemptId });
    expect(events).toEqual(["persist-start", "execute", "persist-result"]);
    expect(begin).toHaveBeenCalledWith(target);
    expect(finish).toHaveBeenCalledWith(attemptId, { status: "created", contactId: 45 });
  });
  it("blocks all provider activity if start fails or an unresolved attempt exists", async () => {
    begin.mockRejectedValue(new Error("private database error"));
    expect(await syncBrevoContactWithJournal(target, options())).toEqual({ status: "blocked", reason: "journal_unavailable_or_unresolved" });
    expect(mocks.sync).not.toHaveBeenCalled(); expect(finish).not.toHaveBeenCalled();
  });
  it("rejects an invalid persisted attempt id", async () => {
    begin.mockResolvedValue("invalid");
    expect((await syncBrevoContactWithJournal(target, options())).status).toBe("blocked");
    expect(mocks.sync).not.toHaveBeenCalled();
  });
  it.each([
    { status: "suppressed", contactId: 45 },
    { status: "blocked", reason: "email_collision" },
    { status: "skipped", reason: "already_linked" },
    { status: "failed", reason: "provider_rejected" },
    { status: "write_outcome_unknown", reason: "reconcile_before_retry" }
  ])("persists outcome without retry: %o", async result => {
    mocks.sync.mockResolvedValue(result);
    expect(await syncBrevoContactWithJournal(target, options())).toEqual({ ...result, attemptId });
    expect(finish).toHaveBeenCalledWith(attemptId, result); expect(mocks.sync).toHaveBeenCalledTimes(1);
  });
  it("marks unexpected execution exceptions as uncertain without exposing their details", async () => {
    mocks.sync.mockRejectedValue(new Error("secret provider details"));
    const result = { status: "write_outcome_unknown", reason: "reconcile_before_retry" };
    expect(await syncBrevoContactWithJournal(target, options())).toEqual({ ...result, attemptId });
    expect(finish).toHaveBeenCalledWith(attemptId, result);
  });
  it("does not claim completed success if result persistence fails", async () => {
    finish.mockRejectedValue(new Error("private database details"));
    expect(await syncBrevoContactWithJournal(target, options())).toEqual({ status: "write_outcome_unknown", reason: "journal_completion_failed", attemptId });
    expect(begin).toHaveBeenCalledTimes(1); expect(mocks.sync).toHaveBeenCalledTimes(1); expect(finish).toHaveBeenCalledTimes(1);
  });
});
