vi.mock("@/services/local-calendar-stops", () => ({ getLocalBookedEmails: async () => new Set() }));
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { prepareLocalEmailCampaign } from "./local-email-campaign";
const mocks = vi.hoisted(() => ({ create: vi.fn(), sender: vi.fn(), verify: vi.fn() }));
vi.mock("@/services/brevo", () => ({ createBrevoRecruitmentTemplate: mocks.create, verifyBrevoSender: mocks.sender, verifyBrevoTemplate: mocks.verify }));
const personId = "22222222-2222-4222-8222-222222222222";
const body = "Bonjour [Prénom],\\n\\nVotre équipe à [Ville] : jusqu’à 18 % de rémunération liée à son activité.";
const review = { campaign_key: "saint-maur-local-20261016", approved_by_user: true, approved_at: "2026-10-16T09:10:05Z", sender_email: "renato.ponzio@neos-immo.com",
  batches: [{ person_ids: [personId], proposed_date: "2026-10-17", proposed_time: "09:30", timezone: "Europe/Paris" }],
  templates: [{ step: 1, delay_days: 0, subject: "Votre équipe à Saint-Maur", body_local: body, body_nearby: body },{ step: 2, delay_days: 10, subject: "Deuxième message", body },{ step: 3, delay_days: 20, subject: "Dernier message", body }] };
function database(reviewValue: unknown = review, local?: unknown) {
  const updates: Array<{ metadata: Record<string, unknown> }> = [];
  const metadata = { unrelated: "kept", local_sequence_review_20261016: reviewValue, local_recruitment_campaign: local };
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn(async () => ({ data: { id: "project", tenant_id: "tenant", status: "open", archived_at: null, metadata }, error: null })),
    update: vi.fn(value => { updates.push(value); return query; }), then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve) };
  return { db: { from: vi.fn(() => query) } as unknown as SupabaseClient, updates };
}
describe("approved Saint-Maur template preparation", () => {
  beforeEach(() => { vi.resetAllMocks(); let id=80; mocks.create.mockImplementation(async () => ({ success: true, templateId: ++id })); });
  it("creates and verifies four dedicated templates, preserves signature and leaves launch disabled", async () => {
    const { db,updates }=database(); const config=await prepareLocalEmailCampaign(db,"project");
    expect(config).toMatchObject({ template_ids: [81,82,83,84], launch_enabled: false, sender_verified: true });
    expect(mocks.verify).toHaveBeenCalledTimes(4);
    const html=mocks.create.mock.calls[0][0].htmlContent as string;
    expect(html).toContain("18 %"); expect(html).toContain("{{ params.PRENOM }}"); expect(html).toContain("{{ params.VILLE }}");
    expect(html).not.toContain("\\n"); expect(html).not.toContain("[Prénom]");
    expect(html.match(/Président<br \/>Expert Immobilier/g)).toHaveLength(1);
    expect(updates.at(-1)).toMatchObject({ metadata: { unrelated: "kept", local_sequence_review_20261016: review } });
    expect(updates.at(-1)!.metadata).not.toHaveProperty("recruitment_email_campaign");
  });
  it.each([{ ...review, approved_by_user: false },{ ...review, sender_email: "other@example.test" },{ ...review, batches: [...review.batches,...review.batches] }])("rejects missing approval, changed sender and duplicate recipients before Brevo", async value => {
    await expect(prepareLocalEmailCampaign(database(value).db,"project")).rejects.toThrow();
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.sender).not.toHaveBeenCalled();
  });
  it("reuses persisted template IDs after an interrupted verification", async () => {
    const first=await prepareLocalEmailCampaign(database().db,"project"); mocks.create.mockClear(); mocks.verify.mockClear();
    await prepareLocalEmailCampaign(database(review,first).db,"project");
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.verify).toHaveBeenCalledTimes(4);
  });
  it("rejects content changed since preparation", async () => {
    const first=await prepareLocalEmailCampaign(database().db,"project"); mocks.create.mockClear();
    await expect(prepareLocalEmailCampaign(database({ ...review, templates: review.templates.map((t,i) => i===0 ? { ...t,body_local: body+" Modification" } : t) },first).db,"project")).rejects.toThrow("changé");
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
