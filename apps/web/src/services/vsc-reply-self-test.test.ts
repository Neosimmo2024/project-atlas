import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/types/domain";
const { from, insert, sendMail, close, worker, load, save, checkpoint } = vi.hoisted(() => ({ from: vi.fn(), insert: vi.fn(), sendMail: vi.fn(), close: vi.fn(), worker: vi.fn(), load: vi.fn(), save: vi.fn(), checkpoint: vi.fn() }));
vi.mock("@/lib/supabase/service-role", () => ({ createSupabaseServiceRoleClient: () => ({ from }) }));
vi.mock("@/services/vsc-reply-worker", () => ({ reconcileVscRepliesOnce: worker }));
vi.mock("@/services/vsc-imap-cursor", () => ({ loadVscImapCursor: load, saveVscImapCursor: save }));
vi.mock("@/services/vsc-ovh-imap", () => ({ getVscInboxCheckpoint: checkpoint }));
vi.mock("@/services/ovh-connection", async original => ({ ...await original<typeof import("./ovh-connection")>(), createOvhTransport: () => ({ sendMail, close }) }));
import { canRunVscReplySelfTest, verifyVscReplySelfTest } from "./vsc-reply-self-test";
const tenant = "f716f14d-7fc8-4e33-a49a-18c6a2367816";
const context = { tenantId: tenant, role: "owner", userId: "owner", tenant: { id: tenant, name: "VendreSonCommerce" } } as TenantContext;
describe("VSC real-mailbox self-test guard", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("VSC_OVH_TENANT_ID", tenant); vi.stubEnv("VSC_OVH_SMTP_PASSWORD", "synthetic-test-password"); vi.stubEnv("VERCEL_ENV", "preview"); vi.stubEnv("VSC_REPLY_SELF_TEST_ENABLED", "true"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://mahgxumwucxehsooijag.supabase.co");
    load.mockResolvedValue({ uidValidity: null, lastUid: 0, version: 0 }); checkpoint.mockResolvedValue({ uidValidity: "42", lastUid: 10 }); save.mockResolvedValue(undefined); worker.mockResolvedValue({ recorded: 1 });
    sendMail.mockResolvedValue({ accepted: ["contact@vendresoncommerce.com"] });
    from.mockImplementation(table => {
      const filters: Record<string, string> = {}; let operation = "read";
      const q = { select: vi.fn(), eq: vi.fn(), limit: vi.fn(), maybeSingle: vi.fn(), single: vi.fn(), update: vi.fn(), insert: vi.fn(), then: (resolve: (value: unknown) => unknown) => {
        let data: unknown = null;
        if (operation === "read") {
          if (table === "vsc_campaigns") data = { id: "test", name: "[TEST TECHNIQUE OVH] Réponse et arrêt des relances", state: "draft", approved_at: null, enabled_at: null };
          if (table === "vsc_campaign_deliveries") data = filters.step_key === "technical-reply" ? { person_id: "person", status: "sent", provider_message_id: "reply-id" } : filters.step_key === "technical-followup" ? { status: "cancelled" } : [];
          if (table === "vsc_inbound_replies") data = { id: "reply" };
        }
        return Promise.resolve({ data, error: null }).then(resolve);
      } };
      for (const fn of [q.select, q.limit, q.maybeSingle, q.single]) fn.mockReturnValue(q);
      q.eq.mockImplementation((key, value) => { filters[key] = value; return q; });
      q.insert.mockImplementation(rows => { operation = "insert"; insert(table, rows); return q; }); q.update.mockImplementation(() => { operation = "update"; return q; });
      return q;
    });
  });
  afterEach(() => vi.unstubAllEnvs());
  it("refuses production, wrong database, wrong tenant and non-admin roles", async () => {
    vi.stubEnv("VERCEL_ENV", "production"); expect(canRunVscReplySelfTest(context)).toBe(false);
    expect((await verifyVscReplySelfTest(context)).success).toBe(false); expect(from).not.toHaveBeenCalled();
    vi.stubEnv("VERCEL_ENV", "preview"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://other.supabase.co"); expect(canRunVscReplySelfTest(context)).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://mahgxumwucxehsooijag.supabase.co"); expect(canRunVscReplySelfTest({ ...context, tenantId: "neos" })).toBe(false); expect(canRunVscReplySelfTest({ ...context, role: "reader" })).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });
  it("sends exactly two technical messages to its own mailbox with real reply threading", async () => {
    expect((await verifyVscReplySelfTest(context)).success).toBe(true);
    expect(sendMail).toHaveBeenCalledTimes(2);
    const original = sendMail.mock.calls[0][0], reply = sendMail.mock.calls[1][0];
    expect(original.to).toBe("contact@vendresoncommerce.com"); expect(reply.to).toBe(original.to); expect(reply.inReplyTo).toBe(original.messageId); expect(reply.references).toEqual([original.messageId]);
    expect(insert).toHaveBeenCalledWith("people", expect.objectContaining({ do_not_contact: true, contact_allowed: false, source: "vsc-reply-self-test" }));
    const rows = insert.mock.calls.find(call => call[0] === "vsc_campaign_deliveries")![1];
    expect(rows.every((row: { id?: string }) => typeof row.id === "string" && /^[0-9a-f-]{36}$/i.test(row.id))).toBe(true);
    expect(new Set(rows.map((row: { id: string }) => row.id)).size).toBe(3);
    expect(insert).toHaveBeenCalledWith("vsc_campaigns", expect.not.objectContaining({ state: "active" })); expect(worker).toHaveBeenCalledWith(tenant); expect(close).toHaveBeenCalled();
  });
  it("resumes reconciliation without sending or resetting the checkpoint", async () => {
    expect((await verifyVscReplySelfTest(context, "existing-test")).success).toBe(true); expect(sendMail).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled(); expect(insert).not.toHaveBeenCalled();
  });
  it("never retries an ambiguous SMTP failure automatically", async () => {
    sendMail.mockRejectedValueOnce(new Error("connection lost")); expect((await verifyVscReplySelfTest(context)).success).toBe(false); expect(sendMail).toHaveBeenCalledTimes(1); expect(worker).not.toHaveBeenCalled(); expect(close).toHaveBeenCalled();
  });
});
