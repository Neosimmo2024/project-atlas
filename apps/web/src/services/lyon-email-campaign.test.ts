import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { prepareLyonEmailCampaign, resolveLyonFollowUp } from "./lyon-email-campaign";
import { canLaunchLyon, makeLyonSnapshot } from "@/features/recruitment-email/lyon-campaign";
const mocks = vi.hoisted(() => ({ create: vi.fn(), sender: vi.fn(), verify: vi.fn() }));
vi.mock("@/services/brevo", () => ({ createBrevoRecruitmentTemplate: mocks.create, verifyBrevoSender: mocks.sender, verifyBrevoTemplate: mocks.verify }));
const projectId = "11111111-1111-4111-8111-111111111111";
const personId = "22222222-2222-4222-8222-222222222222";
const versions = [3, 4, 5].map(i => ({ id: `${i}${i}${i}${i}${i}${i}${i}${i}-${i}${i}${i}${i}-4${i}${i}${i}-8${i}${i}${i}-${String(i).repeat(12)}`, template_name: `Lyon ${i}`, version_number: i, sender_email: "renato.ponzio@neos-immo.com", reply_to: "renato.ponzio@neos-immo.com", sender_name: "NEOS IMMO", subject: "Lyon", html_content: "<p>Lyon</p>" }));
const config = { state: "draft" as const, launch_enabled: false, version_ids: versions.map(v => v.id) as [string, string, string], recipient_ids: [personId] };
const people = [{ id: personId, primary_email: "candidate@example.test", do_not_contact: false, contact_allowed: false, comments: "[projet-lyon-neos-20261007]" }];
function database(campaign: unknown = config, contacts = people) {
  const updates: unknown[] = [];
  const metadata = { lyon_development: { person_ids: [personId], no_outreach: true }, unrelated: "preserved", recruitment_email_campaign: campaign };
  const from = vi.fn((table: string) => {
    const data = table === "projects" ? { id: projectId, metadata } : table === "people" ? contacts : versions;
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), maybeSingle: vi.fn(async () => ({ data, error: null })),
      update: vi.fn((value: unknown) => { updates.push(value); return query; }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve) };
    return query;
  });
  return { db: { from } as unknown as SupabaseClient, from, updates };
}
describe("dedicated Lyon preparation", () => {
  beforeEach(() => { vi.resetAllMocks(); let id = 20; mocks.create.mockImplementation(async () => ({ success: true, templateId: ++id })); mocks.sender.mockResolvedValue(undefined); mocks.verify.mockResolvedValue(undefined); });
  it("prepares three templates without authorizing, sending or scheduling contacts", async () => {
    const { db, from, updates } = database();
    const ready = await prepareLyonEmailCampaign(db, "tenant", projectId);
    expect(ready).toMatchObject({ state: "ready", launch_enabled: false, sender_verified: true, template_ids: [21,22,23] });
    expect(canLaunchLyon(ready, personId)).toBe(false);
    expect(mocks.create).toHaveBeenCalledTimes(3);
    expect(mocks.sender).toHaveBeenCalledWith("renato.ponzio@neos-immo.com");
    expect(from.mock.calls.every(([table]) => ["projects", "people", "recruitment_email_template_versions"].includes(table))).toBe(true);
    expect(updates.at(-1)).toMatchObject({ metadata: { unrelated: "preserved", lyon_development: { no_outreach: true }, recruitment_email_campaign: { launch_enabled: false } } });
  });
  it("reads template versions through the authenticated client without broadening service grants", async () => {
    const service = database(); const authenticated = database();
    await prepareLyonEmailCampaign(service.db, "tenant", projectId, authenticated.db);
    expect(service.from.mock.calls.some(([table]) => table === "recruitment_email_template_versions")).toBe(false);
    expect(authenticated.from).toHaveBeenCalledExactlyOnceWith("recruitment_email_template_versions");
  });
  it("reuses persisted templates on retry", async () => {
    const { db } = database({ ...config, pending_template_ids: [81,82,83] });
    await prepareLyonEmailCampaign(db, "tenant", projectId);
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.verify).toHaveBeenCalledTimes(3);
  });
  it("rejects a recipient outside Lyon before contacting Brevo", async () => {
    const { db } = database({ ...config, recipient_ids: [projectId] });
    await expect(prepareLyonEmailCampaign(db, "tenant", projectId)).rejects.toThrow("n’appartient pas");
    expect(mocks.sender).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rejects a forbidden contact before creating templates", async () => {
    const { db } = database(config, [{ ...people[0], do_not_contact: true }]);
    await expect(prepareLyonEmailCampaign(db, "tenant", projectId)).rejects.toThrow("restrictions");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("never resolves an unbound Lyon sequence to national models", async () => {
    const { db, from } = database();
    expect(await resolveLyonFollowUp(db,"tenant",personId,people[0].comments,null)).toEqual({ blocked: true });
    expect(from).not.toHaveBeenCalled();
  });
  it("keeps a sequence in Lyon after its person marker is removed, and blocks changed templates", async () => {
    const campaign = { ...config, state: "ready" as const, launch_enabled: true, sender_verified: true, template_ids: [41,42,43] as [number,number,number] };
    const snapshot = makeLyonSnapshot(projectId,campaign);
    const { db } = database(campaign);
    expect(await resolveLyonFollowUp(db,"tenant",personId,null,snapshot)).toEqual({ blocked: false, snapshot });
    const changed = database({ ...campaign, template_ids: [41,42,99] }).db;
    expect(await resolveLyonFollowUp(changed,"tenant",personId,null,snapshot)).toEqual({ blocked: true });
    expect(canLaunchLyon(campaign, projectId)).toBe(false);
  });
});
