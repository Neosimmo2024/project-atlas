import { describe, expect, it } from "vitest";
import { planVscImapBatch } from "./imap-cursor";
const cursor = { uidValidity: "42", lastUid: 200, version: 1 };
describe("VSC IMAP checkpoints", () => {
  it("drains a mailbox in bounded UID ranges, including more than 100 messages", () => {
    expect(planVscImapBatch(cursor, "42", 651)).toEqual({ range: "201:400", lastUid: 400, hasMore: true });
    expect(planVscImapBatch({ ...cursor, lastUid: 600 }, "42", 651)).toEqual({ range: "601:650", lastUid: 650, hasMore: false });
  });
  it("restarts from the beginning when UIDVALIDITY changes", () => {
    expect(planVscImapBatch(cursor, "43", 51)).toEqual({ range: "1:50", lastUid: 50, hasMore: false });
  });
  it("does not fetch backwards when no messages remain", () => {
    expect(planVscImapBatch(cursor, "42", 201)).toEqual({ range: null, lastUid: 200, hasMore: false });
    expect(planVscImapBatch({ ...cursor, uidValidity: null, lastUid: 0 }, "42", 1).range).toBeNull();
  });
  it("rejects invalid states instead of skipping mail", () => {
    expect(() => planVscImapBatch(cursor, "42", 100)).toThrow();
    expect(() => planVscImapBatch(cursor, "bad", 400)).toThrow();
    expect(() => planVscImapBatch(cursor, "42", 400, 0)).toThrow();
  });
});
