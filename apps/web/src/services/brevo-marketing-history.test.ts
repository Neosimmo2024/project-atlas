import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), fetch: vi.fn(), writes: [] as unknown[] }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service-role", () => ({ createSupabaseServiceRoleClient: () => ({ rpc: m.rpc, from: m.from }) }));
import { syncMarketingHistory } from "./brevo-marketing-history";
beforeEach(() => {
  vi.resetAllMocks(); m.writes = [];
  vi.stubGlobal("fetch", m.fetch);
  m.rpc.mockResolvedValue({ data: null, error: null });
  m.from.mockReturnValue({ upsert: (rows: unknown[]) => { m.writes.push(...rows); return { select: async () => ({ data: [{ id: "proof" }], error: null }) }; } });
  m.fetch.mockImplementation(async (url: string) => {
    let data: unknown;
    if (url.includes("emailCampaigns")) data = { campaigns: [{ id: 19, name: "Café", subject: "Un café ?", sender: { email: "renato.ponzio@neos-immo.com" }, recipients: { lists: [9] } }] };
    else if (url.includes("contacts/lists")) data = { contacts: [{ email: "one@example.org" }, { email: "not-sent@example.org" }] };
    else data = { messagesSent: url.includes("one%40") ? [{ campaignId: 19, eventTime: "2026-10-08T09:00:00Z" }] : [] };
    return new Response(JSON.stringify(data), { status: 200 });
  });
});
it("journals provider-confirmed sends rather than assuming every list member received the campaign", async () => {
  const result = await syncMarketingHistory("tenant", new Map([["one@example.org", ["p1"]], ["not-sent@example.org", ["p2"]]]), "fixture");
  expect(result.done).toBe(true);
  expect(m.writes).toHaveLength(1);
  expect(m.writes[0]).toMatchObject({ person_id: "p1", metadata: { campaign_id: 19, match_confidence: "recipient_subject_review", provider_message_id: null } });
  expect(m.fetch.mock.calls.every(([, options]) => options.method === undefined)).toBe(true);
});
