import { describe, expect, it } from "vitest";
import { buildVscReplyAudit } from "./reply-audit";

describe("VSC reply audit", () => {
  it("returns only aggregate processing data", () => {
    expect(buildVscReplyAudit({
      tenantId: "vsc", inspected: 20, matched: 3, recorded: 2,
      timestamp: "2026-10-28T09:00:00Z", status: "completed"
    })).toEqual({
      tenantId: "vsc", inspected: 20, matched: 3, recorded: 2,
      timestamp: "2026-10-28T09:00:00.000Z", status: "completed"
    });
  });
  it("rejects impossible counts", () => {
    expect(() => buildVscReplyAudit({
      tenantId: "vsc", inspected: 1, matched: 2, recorded: 0,
      timestamp: "2026-10-28T09:00:00Z", status: "dry_run"
    })).toThrow();
  });
});
