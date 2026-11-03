import { describe, expect, it } from "vitest";
import { createVscReplyPreviewReport } from "./reply-report";

describe("VSC reply preview reporting", () => {
  it("returns only counts, timestamp and dry-run flag", () => {
    expect(createVscReplyPreviewReport({
      inspected: 10, matched: 2, now: new Date("2026-10-28T09:00:00Z")
    })).toEqual({
      dryRun: true, inspected: 10, matched: 2,
      generatedAt: "2026-10-28T09:00:00.000Z"
    });
  });
  it("rejects inconsistent totals", () => {
    expect(() => createVscReplyPreviewReport({
      inspected: 1, matched: 2, now: new Date()
    })).toThrow();
  });
});
