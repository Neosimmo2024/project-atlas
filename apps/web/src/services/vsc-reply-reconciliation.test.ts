/**
 * Dry-run reconciliation service tests. No real IMAP connection, no database
 * mutation, and no message dispatch.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { limit, inbox } = vi.hoisted(() => ({ limit: vi.fn(), inbox: vi.fn() }));
const from = vi.hoisted(() => vi.fn(() => {
  const query = { eq: vi.fn(), not: vi.fn(), limit };
  query.eq.mockReturnValue(query);
  query.not.mockReturnValue(query);
  return { select: () => query };
}));
vi.mock("@/lib/supabase/service-role", () => ({
  createSupabaseServiceRoleClient: () => ({ from })
}));
vi.mock("@/services/vsc-ovh-imap", () => ({
  inspectVscInboxHeaders: inbox
}));
import { previewVscReplyReconciliation } from "./vsc-reply-reconciliation";

describe("VSC read-only reply preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VSC_OVH_TENANT_ID = "vsc";
    limit.mockResolvedValue({ data: [{
      tenant_id: "vsc", campaign_id: "campaign", person_id: "person",
      provider_message_id: "<outbound@example.com>",
      people: { primary_email: "shop@example.com" }
    }], error: null });
    inbox.mockResolvedValue([{
      messageId: "<reply@example.com>", from: "shop@example.com",
      inReplyTo: "<outbound@example.com>", references: [],
      receivedAt: "2026-10-28T09:00:00Z"
    }]);
  });
  it("rejects other tenants before reading mailbox or DB", async () => {
    await expect(previewVscReplyReconciliation("neos")).rejects.toThrow();
    expect(from).not.toHaveBeenCalled();
    expect(inbox).not.toHaveBeenCalled();
  });
  it("finds a linked reply without any database write", async () => {
    const result = await previewVscReplyReconciliation("vsc");
    expect(result.dryRun).toBe(true);
    expect(result.matches).toHaveLength(1);
    expect(from).toHaveBeenCalledWith("vsc_campaign_deliveries");
  });
});
