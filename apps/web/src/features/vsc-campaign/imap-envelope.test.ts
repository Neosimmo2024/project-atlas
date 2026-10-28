import { describe, expect, it } from "vitest";
import { findVscOriginalMessageId, normalizeVscInboundEnvelope } from "./imap-envelope";

const raw = {
  messageId: "<incoming@example.com>", from: "SHOP@example.com",
  inReplyTo: "<original@example.com>", references: ["<older@example.com>"],
  receivedAt: "2026-10-28T09:00:00Z"
};

describe("VSC IMAP envelope parsing", () => {
  it("normalizes valid reply metadata", () => {
    expect(normalizeVscInboundEnvelope(raw)).toEqual({
      ...raw, from: "shop@example.com"
    });
  });
  it("rejects unrelated messages and malformed headers", () => {
    expect(normalizeVscInboundEnvelope({ ...raw, inReplyTo: null, references: [] })).toBeNull();
    expect(normalizeVscInboundEnvelope({ ...raw, messageId: "bad" })).toBeNull();
    expect(normalizeVscInboundEnvelope({ ...raw, from: "bad" })).toBeNull();
  });
  it("matches only an explicitly known outbound message id", () => {
    const parsed = normalizeVscInboundEnvelope(raw)!;
    expect(findVscOriginalMessageId(parsed, ["<original@example.com>"])).toBe("<original@example.com>");
    expect(findVscOriginalMessageId(parsed, ["<unrelated@example.com>"])).toBeNull();
  });
});
