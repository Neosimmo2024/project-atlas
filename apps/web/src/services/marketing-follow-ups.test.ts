import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveMarketingFollowUp } from "./marketing-follow-ups";
const snapshot = { key: "bordeaux-marketing-20261023", project_id: "11111111-1111-4111-8111-111111111111", template_ids: [51,51,52], first_name: "Alex", days: [0,15,30] };
function database(enabled = true) {
  return { from: (table: string) => {
    const result = { error: null, data: table === "people" ? { primary_email: "alex@example.test" } : { status: "open", archived_at: null,
      metadata: { recruitment_email_campaign: { state: "ready", launch_enabled: enabled, sender_verified: true, recipient_ids: ["person"], template_ids: [51,51,52] } } } };
    const query = { select: () => query, eq: () => query, single: async () => result, maybeSingle: async () => result };
    return query;
  } } as unknown as SupabaseClient;
}
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("Bordeaux follow-up guard", () => {
  it("keeps the approved templates for an eligible contact", async () => {
    vi.stubEnv("BREVO_API_KEY", "test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ emailBlacklisted: false })));
    expect(await resolveMarketingFollowUp(database(), "tenant", "person", snapshot)).toEqual({ blocked: false, snapshot });
  });
  it("blocks a marketing opt-out even when SMTP could send", async () => {
    vi.stubEnv("BREVO_API_KEY", "test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ emailBlacklisted: true })));
    expect(await resolveMarketingFollowUp(database(), "tenant", "person", snapshot)).toEqual({ blocked: true });
  });
  it("fails closed when the provider cannot verify suppression", async () => {
    vi.stubEnv("BREVO_API_KEY", "test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    await expect(resolveMarketingFollowUp(database(), "tenant", "person", snapshot)).rejects.toThrow("BREVO_FOLLOW_UP_READ_503");
  });
  it("never uses a national template when the campaign is paused", async () => {
    expect(await resolveMarketingFollowUp(database(false), "tenant", "person", snapshot)).toEqual({ blocked: true });
  });
});
