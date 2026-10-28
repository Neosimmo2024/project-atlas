import { describe, expect, it } from "vitest";
import { findVscOriginalMessageId, normalizeVscInboundEnvelope, parseVscThreadHeaders } from "./imap-envelope";

const raw = {
  messageId: "<incoming@example.com>", from: "SHOP@example.com",
  inReplyTo: "<original@example.com>", references: ["<older@example.com>"],
  receivedAt: "2026-10-28T09:00:00Z"
};

describe("VSC IMAP envelope parsing", () => {
  it("normalizes valid reply metadata", () => {
    expect(normalizeVscInboundEnvelope(raw)).toEqual({
      ...raw, from: "shop@example.com", receivedAt: "2026-10-28T09:00:00.000Z"
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

describe("OVH thread headers", () => {
  it("matches a References-only reply with folded headers", () => {
    const thread = parseVscThreadHeaders("References: <older@example.com>\r\n\t<original@example.com>\r\nDate: ignored\r\n");
    const envelope = normalizeVscInboundEnvelope({ ...raw, ...thread });
    expect(envelope).not.toBeNull();
    expect(findVscOriginalMessageId(envelope!, ["<original@example.com>"])).toBe("<original@example.com>");
  });
  it("keeps In-Reply-To and ignores unrelated header values", () => {
    expect(parseVscThreadHeaders("in-reply-to: <original@example.com>\r\nSubject: <unrelated@example.com>\r\nReferences: invalid")).toEqual({ inReplyTo: "<original@example.com>", references: [] });
  });
});
