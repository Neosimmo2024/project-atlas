/** Disposable local Supabase only. Real application services/RPC, simulated OVH input. */
import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
const { inbox } = vi.hoisted(() => ({ inbox: vi.fn() }));
vi.mock("@/services/vsc-ovh-imap", () => ({ inspectVscInboxBatch: inbox }));
vi.mock("nodemailer", () => ({ default: { createTransport: () => { throw new Error("Transport interdit dans ce test"); } } }));
import { defaultVscEmailContent } from "@/features/vsc-campaign/email-content";
import { buildVscReviewPlan } from "@/features/vsc-campaign/review-plan";
import { saveVscDraftPlan } from "./vsc-campaign-drafts";
import { reconcileVscRepliesOnce } from "./vsc-reply-worker";
import { unsubscribeVscContact, checkVscContactStop } from "./vsc-contact-stop";
import { previewVscEmailDraft, saveVscEmailDraft, readVscEmailDraft } from "./vsc-draft-workspace";
import { reserveVscEmail, beginVscEmail, releaseVscEmail, recordVscEmailResult } from "./vsc-email-reservations";
import { loadVscImapCursor, saveVscImapCursor } from "./vsc-imap-cursor";

const enabled = process.env.VSC_DISPOSABLE_TEST_DB === "1";
async function checked<T>(request: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const result = await request;
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

describe.skipIf(!enabled)("VSC real Supabase reply flow", () => {
  let db: SupabaseClient;
  let tenant: string, foreignTenant: string, person: string, campaign: string, foreignCampaign: string;
  let outbound: string;
  let approvalActor: string;
  const promotionExpired = Date.now() >= Date.parse("2026-11-30T23:00:00Z");
  beforeAll(async () => {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://invalid");
    if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "54321" || url.username || url.password)
      throw new Error("Test réservé au Supabase local jetable sur le port 54321");
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) throw new Error("Clé locale Supabase absente");
    db = createClient(url.origin, key, { auth: { persistSession: false, autoRefreshToken: false } });
    // Admin creation on this disposable localhost instance sends no confirmation email.
    const actor = await db.auth.admin.createUser({ email: `vsc-actor-${randomUUID()}@fixture.invalid`, email_confirm: true });
    if (actor.error || !actor.data.user) throw new Error("Disposable approval fixture unavailable");
    approvalActor = actor.data.user.id;
  });
  beforeEach(async () => {
    inbox.mockReset();
    tenant = randomUUID(); foreignTenant = randomUUID(); person = randomUUID(); campaign = randomUUID(); foreignCampaign = randomUUID(); outbound = `<sent-${randomUUID()}@fixture.invalid>`;
    const foreignPerson = randomUUID();
    vi.stubEnv("VSC_OVH_TENANT_ID", tenant);
    await checked(db.from("tenants").insert([{ id: tenant, name: "VSC synthetic integration" }, { id: foreignTenant, name: "Other synthetic integration" }]));
    await checked(db.from("people").insert([{ id: person, tenant_id: tenant, display_name: "VSC fixture", primary_email: "shop@fixture.invalid", contact_allowed: true }, { id: foreignPerson, tenant_id: foreignTenant, display_name: "Other fixture", primary_email: "other@fixture.invalid", contact_allowed: false }]));
    await checked(db.from("vsc_campaigns").insert([{ id: campaign, tenant_id: tenant, name: "VSC fixture" }, { id: foreignCampaign, tenant_id: foreignTenant, name: "Other fixture" }]));
    const plan = buildVscReviewPlan({ tenantId: tenant, campaignState: "draft", startDate: "2026-10-28", leads: [{ id: person, tenantId: tenant, unsubscribed: false, contact: {
      email: "shop@fixture.invalid", mobile: "0600000000", doNotContact: false, emailOptOut: false, smsOptOut: false, replied: false, appointmentBooked: false, purchased: false
    } }] });
    expect((await saveVscDraftPlan({ tenantId: tenant, campaignId: campaign, plan })).submitted).toBe(3);
    // Fixture representing a historical send; no provider is called.
    await checked(db.from("vsc_campaign_deliveries").update({ status: "sent", provider_message_id: outbound }).eq("tenant_id", tenant).eq("step_key", "offer"));
    await checked(db.from("vsc_campaign_deliveries").insert({ tenant_id: foreignTenant, campaign_id: foreignCampaign, person_id: foreignPerson, channel: "email", step_key: "scheduled", scheduled_at: "2026-11-01T12:00:00Z", status: "scheduled" }));
    inbox.mockResolvedValue({ uidValidity: "42", lastUid: 200, scanned: 1, hasMore: false, envelopes: [{
      messageId: `<reply-${randomUUID()}@fixture.invalid>`, from: "shop@fixture.invalid", inReplyTo: outbound, references: [], receivedAt: "2026-10-28T12:00:00Z"
    }] });
  }, 30000);
  afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

  async function scheduledEmail() {
    await checked(db.from("vsc_campaigns").update({ state: "active", approved_by: approvalActor, approved_at: new Date().toISOString(), enabled_at: new Date().toISOString(), email_content: defaultVscEmailContent() }).eq("tenant_id", tenant).eq("id", campaign));
    const row = await checked(db.from("vsc_campaign_deliveries").update({ status: "scheduled", scheduled_at: new Date(Date.now()-60000).toISOString() }).eq("tenant_id", tenant).eq("campaign_id", campaign).eq("step_key", "consideration").select("id").single());
    if (!row) throw new Error("Scheduled fixture unavailable");
    return row.id as string;
  }
  it("enforces the database clock's promotional end", async () => {
    const id = await scheduledEmail();
    const reservation = await reserveVscEmail(tenant, id);
    if (promotionExpired) expect(reservation).toBeNull(); else expect(reservation).not.toBeNull();
  });
  it.skipIf(promotionExpired)("allows only one concurrent reservation and one concurrent provider start", async () => {
    const id = await scheduledEmail();
    const results = await Promise.all([reserveVscEmail(tenant, id), reserveVscEmail(tenant, id)]);
    const reservations = results.filter(value => value !== null); expect(reservations).toHaveLength(1);
    const reservation = reservations[0]!;
    const starts = await Promise.all([beginVscEmail(tenant, id, reservation.claimToken), beginVscEmail(tenant, id, reservation.claimToken)]);
    expect(starts.filter(value => value !== null)).toHaveLength(1);
  });
  it.skipIf(promotionExpired)("blocks a fresh opt-out after reservation and before provider intent", async () => {
    const id = await scheduledEmail(); const reservation = await reserveVscEmail(tenant, id); expect(reservation).not.toBeNull();
    await unsubscribeVscContact(tenant, person, "email");
    expect(await beginVscEmail(tenant, id, reservation!.claimToken)).toBeNull();
    const row = await checked(db.from("vsc_campaign_deliveries").select("status,dispatch_started_at").eq("tenant_id", tenant).eq("id", id).single());
    expect(row).toEqual({ status: "cancelled", dispatch_started_at: null });
  });
  it.skipIf(promotionExpired)("keeps uncertain acceptance blocked with no automatic restart or release", async () => {
    const id = await scheduledEmail(); const reservation = await reserveVscEmail(tenant, id); expect(reservation).not.toBeNull();
    await beginVscEmail(tenant, id, reservation!.claimToken);
    expect(await recordVscEmailResult(tenant, id, reservation!.claimToken, "unknown")).toBe(true);
    expect(await recordVscEmailResult(tenant, id, reservation!.claimToken, "unknown")).toBe(true);
    expect(await releaseVscEmail(tenant, id, reservation!.claimToken)).toBe(false);
    expect(await beginVscEmail(tenant, id, reservation!.claimToken)).toBeNull();
    expect(await reserveVscEmail(tenant, id)).toBeNull();
    await expect(recordVscEmailResult(tenant, id, reservation!.claimToken, "rejected")).rejects.toThrow("manuellement");
    const row = await checked(db.from("vsc_campaign_deliveries").select("status,dispatch_outcome,provider_message_id").eq("tenant_id", tenant).eq("id", id).single());
    expect(row).toEqual({ status: "claimed", dispatch_outcome: "unknown", provider_message_id: null });
  });
  it.skipIf(promotionExpired)("persists a verified message identity idempotently and rejects a different one", async () => {
    const id = await scheduledEmail(); const reservation = await reserveVscEmail(tenant, id); expect(reservation).not.toBeNull();
    const payload = await beginVscEmail(tenant, id, reservation!.claimToken); expect(payload).not.toBeNull();
    await expect(recordVscEmailResult(tenant, id, reservation!.claimToken, "sent", "<wrong@fixture.invalid>")).rejects.toThrow();
    expect(await recordVscEmailResult(tenant, id, reservation!.claimToken, "sent", payload!.messageId)).toBe(true);
    expect(await recordVscEmailResult(tenant, id, reservation!.claimToken, "sent", payload!.messageId)).toBe(true);
    expect(await reserveVscEmail(tenant, id)).toBeNull();
    const row = await checked(db.from("vsc_campaign_deliveries").select("status,provider_message_id").eq("tenant_id", tenant).eq("id", id).single());
    expect(row).toEqual({ status: "sent", provider_message_id: payload!.messageId });
  });
  it.skipIf(promotionExpired)("releases only before start and invalidates the previous reservation token", async () => {
    const id = await scheduledEmail(); const first = await reserveVscEmail(tenant, id); expect(first).not.toBeNull();
    expect(await releaseVscEmail(tenant, id, first!.claimToken)).toBe(true);
    const second = await reserveVscEmail(tenant, id); expect(second).not.toBeNull(); expect(second!.claimToken).not.toBe(first!.claimToken);
    expect(await beginVscEmail(tenant, id, first!.claimToken)).toBeNull();
    expect(await beginVscEmail(tenant, id, second!.claimToken)).not.toBeNull();
    expect(await releaseVscEmail(tenant, id, second!.claimToken)).toBe(false);
    expect(await recordVscEmailResult(tenant, id, second!.claimToken, "rejected")).toBe(true);
    expect(await reserveVscEmail(tenant, id)).toBeNull();
  });
  it("does not reserve future dates or drafts that have not been approved", async () => {
    const row = await checked(db.from("vsc_campaign_deliveries").update({ status: "scheduled", scheduled_at: new Date(Date.now()-60000).toISOString() }).eq("tenant_id", tenant).eq("step_key", "consideration").select("id").single());
    if (!row) throw new Error("Fixture unavailable");
    expect(await reserveVscEmail(tenant, row.id)).toBeNull();
    const id = await scheduledEmail();
    await checked(db.from("vsc_campaign_deliveries").update({ scheduled_at: new Date(Date.now()+3600000).toISOString() }).eq("tenant_id", tenant).eq("id", id));
    expect(await reserveVscEmail(tenant, id)).toBeNull();
    expect((await db.rpc("vsc_reserve_email_delivery", { p_tenant_id: foreignTenant, p_delivery_id: id })).data).toBeNull();
  });
  it("creates an email draft atomically and reuses the same request without duplicating it", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-28T12:00:00Z"));
    const draft = { campaignId: randomUUID(), name: "Email draft fixture", startDate: "2026-10-28", personIds: [person] };
    const preview = await previewVscEmailDraft(tenant, draft);
    expect(preview.plan.map(x => x.channel)).toEqual(["email", "email"]);
    expect(await saveVscEmailDraft(tenant, draft, preview.reviewKey)).toEqual({ campaignId: draft.campaignId, submitted: 2, reused: false });
    expect(await saveVscEmailDraft(tenant, draft, preview.reviewKey)).toEqual({ campaignId: draft.campaignId, submitted: 2, reused: true });
    const stored = await checked(db.from("vsc_campaigns").select("state,approved_at,enabled_at").eq("tenant_id", tenant).eq("id", draft.campaignId).single());
    expect(stored).toEqual({ state: "draft", approved_at: null, enabled_at: null });
    const rows = await checked(db.from("vsc_campaign_deliveries").select("status,channel").eq("tenant_id", tenant).eq("campaign_id", draft.campaignId));
    expect(rows).toEqual([{ status: "draft", channel: "email" }, { status: "draft", channel: "email" }]);
  });
  it("persists the reviewed copy and refuses a different copy under the same request identity", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-28T12:00:00Z"));
    const content = defaultVscEmailContent(); content.messages[0].subject = "TEST persisted copy";
    const draft = { campaignId: randomUUID(), name: "Copy fixture", startDate: "2026-10-28", personIds: [person], content };
    const preview = await previewVscEmailDraft(tenant, draft);
    await saveVscEmailDraft(tenant, draft, preview.reviewKey);
    expect((await readVscEmailDraft(tenant, draft.campaignId)).campaign.email_content).toEqual(content);
    const changed = defaultVscEmailContent(); changed.messages[0].subject = "TEST different copy";
    const altered = { ...draft, content: changed };
    const newPreview = await previewVscEmailDraft(tenant, altered);
    await expect(saveVscEmailDraft(tenant, altered, newPreview.reviewKey)).rejects.toThrow("Sauvegarde");
    expect((await readVscEmailDraft(tenant, draft.campaignId)).campaign.email_content).toEqual(content);
  });
  it("does not expose another tenant's saved draft", async () => {
    await expect(readVscEmailDraft(tenant, foreignCampaign)).rejects.toThrow("introuvable");
    await expect(readVscEmailDraft(foreignTenant, campaign)).rejects.toThrow("Entreprise");
  });
  it("rejects stale eligibility and changed previews without creating a campaign", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-28T12:00:00Z"));
    const draft = { campaignId: randomUUID(), name: "Stale draft fixture", startDate: "2026-10-28", personIds: [person] };
    const preview = await previewVscEmailDraft(tenant, draft);
    await expect(saveVscEmailDraft(tenant, { ...draft, name: "Changed" }, preview.reviewKey)).rejects.toThrow("aperçu");
    await checked(db.from("people").update({ contact_allowed: false }).eq("tenant_id", tenant).eq("id", person));
    await expect(saveVscEmailDraft(tenant, draft, preview.reviewKey)).rejects.toThrow("éligible");
    const stored = await checked(db.from("vsc_campaigns").select("id").eq("id", draft.campaignId)); expect(stored).toEqual([]);
  });
  it("rolls back the entire draft if one contact belongs to another tenant", async () => {
    const foreign = await checked(db.from("people").select("id").eq("tenant_id", foreignTenant).single());
    if (!foreign) throw new Error("Foreign fixture missing");
    const id = randomUUID();
    const result = await db.rpc("vsc_create_email_draft", { p_tenant_id: tenant, p_campaign_id: id, p_name: "Rejected fixture", p_start_date: "2026-10-28", p_person_ids: [person, foreign.id] });
    expect(result.error).not.toBeNull();
    expect(await checked(db.from("vsc_campaigns").select("id").eq("id", id))).toEqual([]);
    expect(await checked(db.from("vsc_campaign_deliveries").select("id").eq("campaign_id", id))).toEqual([]);
  });
  it("rejects a different plan under an existing draft identity", async () => {
    const id = randomUUID();
    const args = { p_tenant_id: tenant, p_campaign_id: id, p_name: "Immutable fixture", p_start_date: "2026-10-28", p_person_ids: [person] };
    await checked(db.rpc("vsc_create_email_draft", args));
    expect((await db.rpc("vsc_create_email_draft", { ...args, p_start_date: "2026-10-29" })).error).not.toBeNull();
    const rows = await checked(db.from("vsc_campaign_deliveries").select("scheduled_at").eq("campaign_id", id).eq("tenant_id", tenant));
    expect(rows).toHaveLength(2); expect(rows?.some(x => x.scheduled_at.startsWith("2026-10-29"))).toBe(false);
  });
  it("persists a draft plan, records a reply and cancels only this tenant's followups", async () => {
    expect(await reconcileVscRepliesOnce(tenant)).toEqual({ inspected: 1, matched: 1, recorded: 1, hasMore: false });
    const deliveries = await checked(db.from("vsc_campaign_deliveries").select("status").eq("tenant_id", tenant));
    expect(deliveries?.map(x => x.status).sort()).toEqual(["cancelled", "cancelled", "sent"]);
    const foreign = await checked(db.from("vsc_campaign_deliveries").select("status").eq("tenant_id", foreignTenant));
    expect(foreign?.map(x => x.status)).toEqual(["scheduled"]);
    const replies = await checked(db.from("vsc_inbound_replies").select("id").eq("tenant_id", tenant)); expect(replies).toHaveLength(1);
    expect(await loadVscImapCursor(tenant)).toEqual({ uidValidity: "42", lastUid: 200, version: 1 });
  });
  it("replaying a batch does not duplicate its reply journal", async () => {
    await reconcileVscRepliesOnce(tenant);
    expect((await reconcileVscRepliesOnce(tenant)).recorded).toBe(0);
    const replies = await checked(db.from("vsc_inbound_replies").select("id").eq("tenant_id", tenant)); expect(replies).toHaveLength(1);
  });
  it("keeps the checkpoint after a failure and succeeds on retry", async () => {
    inbox.mockRejectedValueOnce(new Error("Simulated IMAP interruption"));
    await expect(reconcileVscRepliesOnce(tenant)).rejects.toThrow("interruption");
    expect(await loadVscImapCursor(tenant)).toEqual({ uidValidity: null, lastUid: 0, version: 0 });
    expect((await reconcileVscRepliesOnce(tenant)).recorded).toBe(1);
  });
  it("rejects stale concurrent checkpoints against the real REST API", async () => {
    const a = await loadVscImapCursor(tenant); const b = await loadVscImapCursor(tenant);
    const batch = { uidValidity: "42", lastUid: 200, scanned: 0, hasMore: false, envelopes: [] };
    await saveVscImapCursor(tenant, a, batch);
    await expect(saveVscImapCursor(tenant, b, { ...batch, lastUid: 100 })).rejects.toThrow("concurrente");
    expect((await loadVscImapCursor(tenant)).lastUid).toBe(200);
  });
  it("blocks a revoked contact authorization using fresh database state", async () => {
    expect(await checkVscContactStop(tenant, person, "shop@fixture.invalid")).toEqual({ stopped: false });
    await checked(db.from("people").update({ contact_allowed: false }).eq("tenant_id", tenant).eq("id", person));
    expect(await checkVscContactStop(tenant, person, "shop@fixture.invalid")).toEqual({ stopped: true });
    const unchanged = await checked(db.from("vsc_campaign_deliveries").select("status").eq("tenant_id", foreignTenant));
    expect(unchanged?.map(x => x.status)).toEqual(["scheduled"]);
  });
  it("persists email opt-outs and cancels only email followups", async () => {
    expect(await checkVscContactStop(tenant, person, "shop@fixture.invalid")).toEqual({ stopped: false });
    expect(await unsubscribeVscContact(tenant, person, "email")).toEqual({ cancelled: 1 });
    expect(await unsubscribeVscContact(tenant, person, "email")).toEqual({ cancelled: 0 });
    expect(await checkVscContactStop(tenant, person, "shop@fixture.invalid")).toEqual({ stopped: true });
    await checked(db.from("vsc_campaign_deliveries").update({ status: "draft" }).eq("tenant_id", tenant).eq("step_key", "consideration"));
    expect((await unsubscribeVscContact(tenant, person, "email")).cancelled).toBe(1);
    const deliveries = await checked(db.from("vsc_campaign_deliveries").select("status,channel").eq("tenant_id", tenant));
    expect(deliveries?.find(x => x.channel === "sms")?.status).toBe("draft");
    const foreign = await checked(db.from("vsc_campaign_deliveries").select("status").eq("tenant_id", foreignTenant)); expect(foreign?.[0].status).toBe("scheduled");
  });
  it("global opt-outs cancel all pending channels and reject foreign contacts", async () => {
    expect((await unsubscribeVscContact(tenant, person, "all")).cancelled).toBe(2);
    await expect(unsubscribeVscContact(foreignTenant, person, "all")).rejects.toThrow();
    await expect(unsubscribeVscContact(tenant, randomUUID(), "email")).rejects.toThrow();
  });
  it("refuses another tenant without reading the mailbox", async () => {
    await expect(reconcileVscRepliesOnce(foreignTenant)).rejects.toThrow("Entreprise non autorisée"); expect(inbox).not.toHaveBeenCalled();
  });
});
