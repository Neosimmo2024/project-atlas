import { describe, expect, it } from "vitest";
import { canEnableVscReplyWorker } from "./reply-worker-readiness";

const ready = {
  mailboxConfigured: true, imapRoundtripPassed: true,
  outboundMessageIdsPersisted: true, replyJournalMigrationApplied: true,
  cancellationRpcTested: true, tenantIsolationVerified: true,
  idempotencyVerified: true
};

describe("VSC reply worker readiness", () => {
  it("allows readiness only when all checks passed", () => {
    expect(canEnableVscReplyWorker(ready)).toBe(true);
  });
  it("blocks missing migrations and cross-tenant verification", () => {
    expect(canEnableVscReplyWorker({ ...ready, replyJournalMigrationApplied: false })).toBe(false);
    expect(canEnableVscReplyWorker({ ...ready, tenantIsolationVerified: false })).toBe(false);
  });
});
