/** Disposable local Supabase only. Real application services/RPC, simulated OVH input. */
import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
const { inbox } = vi.hoisted(() => ({ inbox: vi.fn() }));
vi.mock("@/services/vsc-ovh-imap", () => ({ inspectVscInboxBatch: inbox }));
vi.mock("nodemailer", () => ({ default: { createTransport: () => { throw new Error("Transport interdit dans ce test"); } } }));
import { buildVscReviewPlan } from "@/features/vsc-campaign/review-plan";
import { saveVscDraftPlan } from "./vsc-campaign-drafts";
import { reconcileVscRepliesOnce } from "./vsc-reply-worker";
import { unsubscribeVscContact, checkVscContactStop } from "./vsc-contact-stop";
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
  beforeAll(() => {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://invalid");
    if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "54321" || url.username || url.password)
      throw new Error("Test réservé au Supabase local jetable sur le port 54321");
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) throw new Error("Clé locale Supabase absente");
    db = createClient(url.origin, key, { auth: { persistSession: false, autoRefreshToken: false } });
  });
  beforeEach(async () => {
    inbox.mockReset();
    tenant = randomUUID(); foreignTenant = randomUUID(); person = randomUUID(); campaign = randomUUID(); foreignCampaign = randomUUID(); outbound = `<sent-${randomUUID()}@fixture.invalid>`;
    const foreignPerson = randomUUID();
    vi.stubEnv("VSC_OVH_TENANT_ID", tenant);
    await checked(db.from("tenants").insert([{ id: tenant, name: "VSC synthetic integration" }, { id: foreignTenant, name: "Other synthetic integration" }]));
    await checked(db.from("people").insert([{ id: person, tenant_id: tenant, display_name: "VSC fixture", primary_email: "shop@fixture.invalid" }, { id: foreignPerson, tenant_id: foreignTenant, display_name: "Other fixture", primary_email: "other@fixture.invalid" }]));
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
  afterEach(() => vi.unstubAllEnvs());

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
