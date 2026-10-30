/** Disposable local Supabase only. Real application services/RPC, simulated OVH input. */
import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
const { inbox, historicalInbox, smtp } = vi.hoisted(() => ({ inbox: vi.fn(), historicalInbox: vi.fn(), smtp: { enabled: false, send: vi.fn(), close: vi.fn() } }));
vi.mock("@/services/vsc-ovh-imap", () => ({ inspectVscInboxBatch: inbox, inspectVscHistoricalInbox: historicalInbox }));
vi.mock("nodemailer", () => ({ default: { createTransport: () => {
  if (!smtp.enabled) throw new Error("Transport interdit dans ce test");
  return { sendMail: smtp.send, close: smtp.close };
} } }));
import { dispatchReservedVscEmail } from "./vsc-reserved-ovh-dispatch";
import { verifyVscUnsubscribeToken } from "./vsc-unsubscribe-token";
import { defaultVscEmailContent } from "@/features/vsc-campaign/email-content";
import { buildVscReviewPlan } from "@/features/vsc-campaign/review-plan";
import { saveVscDraftPlan } from "./vsc-campaign-drafts";
import { reconcileVscRepliesOnce } from "./vsc-reply-worker";
import { unsubscribeVscContact, checkVscContactStop } from "./vsc-contact-stop";
import { previewVscEmailDraft, saveVscEmailDraft, readVscEmailDraft } from "./vsc-draft-workspace";
import { reserveVscEmail, beginVscEmail, releaseVscEmail, recordVscEmailResult } from "./vsc-email-reservations";
import { loadVscImapCursor, saveVscImapCursor } from "./vsc-imap-cursor";
import { getVscDispatchReview } from "./vsc-dispatch-review";
import { saveVscSmsCopy, listVscSmsCopies } from "./vsc-sms-copy-drafts";
import { defaultVscSmsContent } from "@/features/vsc-campaign/sms-content";
import { getVscSmsDraftContacts } from "./vsc-sms-draft-contacts";
import { importVscBrevoContactGroups, vscBrevoImportPersonId } from "./vsc-brevo-contact-import";
import { normalizeVscBrevoContact, groupVscBrevoContacts } from "@/features/vsc-campaign/brevo-contact-import";

import { previewVscLastDayDraft, saveVscLastDayDraft } from "./vsc-last-day-draft";
import { reconcileVscHistoricalInboundOnce } from "./vsc-historical-inbound-worker";
import { previewVscSmsAudience, saveVscSmsAudience } from "./vsc-sms-audience";

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
    inbox.mockReset(); historicalInbox.mockReset(); smtp.enabled = false; smtp.send.mockReset(); smtp.close.mockReset();
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

  async function importOwner() {
    const role = await checked(db.from("roles").select("id").eq("slug", "owner").single());
    await checked(db.from("tenant_users").insert({ tenant_id: tenant, user_id: approvalActor, role_id: role!.id }));
  }
  it.skipIf(Date.now()>=Date.parse("2026-11-30T08:30:00Z"))("prepares the final promotional email on November 30 without duplicating the historical initial email", async () => {
    await importOwner();
    const groups=groupVscBrevoContacts([normalizeVscBrevoContact({id:10,email:"shop@fixture.invalid",emailBlacklisted:false,smsBlacklisted:false,attributes:{}})],id=>vscBrevoImportPersonId(tenant,id));
    await importVscBrevoContactGroups(tenant,approvalActor,groups);
    await checked(db.rpc("vsc_record_brevo_history",{p_tenant_id:tenant,p_actor_id:approvalActor,p_entries:[{provider_id:10,person_id:person,email:"shop@fixture.invalid",sentAt:"2026-10-26T09:48:00Z",delivered:true,hardBounce:false,softBounce:false,emailBlocked:false}]}));
    const preview=await previewVscLastDayDraft(tenant);
    expect(preview).toMatchObject({count:1,sendingEnabled:false,message:{stepKey:"last-chance"}});
    expect(Date.parse(preview.dates[0])).toBe(Date.parse("2026-11-30T08:30:00Z"));
    const saved=await saveVscLastDayDraft(tenant,approvalActor,preview.reviewKey);
    expect(saved.submitted).toBe(1);
    const rows=await checked(db.from("vsc_campaign_deliveries").select("step_key,status,historical_brevo_campaign_id,scheduled_at,provider_message_id").eq("tenant_id",tenant).eq("campaign_id",saved.campaigns[0]));
    expect(rows).toHaveLength(1);expect(rows![0]).toMatchObject({step_key:"last-chance",status:"draft",historical_brevo_campaign_id:2,provider_message_id:null});
    expect(Date.parse(rows![0].scheduled_at)).toBe(Date.parse("2026-11-30T08:30:00Z"));
    expect((await previewVscLastDayDraft(tenant)).count).toBe(0);
    await expect(saveVscLastDayDraft(tenant,approvalActor,preview.reviewKey)).rejects.toThrow("changé");
    expect(await checked(db.from("vsc_campaign_deliveries").select("id").eq("tenant_id",tenant).eq("step_key","offer"))).toHaveLength(1);
    expect(smtp.send).not.toHaveBeenCalled();
  });
  it("holds historical inbound without inventing a verified reply and keeps checkpoints isolated", async () => {
    await importOwner();
    const groups=groupVscBrevoContacts([normalizeVscBrevoContact({id:9,email:"shop@fixture.invalid",emailBlacklisted:false,smsBlacklisted:false,attributes:{SMS:"0612345678"}})],id=>vscBrevoImportPersonId(tenant,id));
    await importVscBrevoContactGroups(tenant,approvalActor,groups);
    await checked(db.rpc("vsc_record_brevo_history",{p_tenant_id:tenant,p_actor_id:approvalActor,p_entries:[{provider_id:9,person_id:person,email:"shop@fixture.invalid",sentAt:"2026-10-26T09:48:00Z",delivered:true,hardBounce:false,softBounce:false,emailBlocked:false}]}));
    historicalInbox.mockResolvedValue({scanned:1,invalid:0,hasMore:false,cursor:{uidValidity:"77",lastUid:100},checkedAt:new Date().toISOString(),envelopes:[{messageId:"<historical-inbound@fixture.invalid>",from:"shop@fixture.invalid",receivedAt:"2026-10-27T10:00:00Z",subject:"Une question",hasThread:false,automated:false}]});
    expect(await reconcileVscHistoricalInboundOnce(tenant,approvalActor)).toMatchObject({held:1,cancelled:2,exactThreadVerified:false,sendingEnabled:false});
    expect(await checked(db.from("vsc_inbound_replies").select("id").eq("tenant_id",tenant))).toHaveLength(0);
    expect(await checked(db.from("vsc_imap_cursors").select("tenant_id").eq("tenant_id",tenant))).toHaveLength(0);
    expect(await checked(db.from("vsc_historical_inbound_holds").select("person_id").eq("tenant_id",tenant))).toEqual([{person_id:person}]);
    expect(await checked(db.from("vsc_campaign_deliveries").select("status").eq("tenant_id",foreignTenant))).toEqual([{status:"scheduled"}]);
    expect((await getVscSmsDraftContacts(tenant)).contacts).toHaveLength(0);
    historicalInbox.mockResolvedValue({scanned:0,invalid:0,hasMore:false,cursor:{uidValidity:"77",lastUid:100},checkedAt:new Date().toISOString(),envelopes:[]});
    expect(await reconcileVscHistoricalInboundOnce(tenant,approvalActor)).toMatchObject({held:0,cancelled:0});
    expect(historicalInbox).toHaveBeenLastCalledWith({uidValidity:"77",lastUid:100});
    expect(smtp.send).not.toHaveBeenCalled();
  });
  it("saves a concurrent canonical SMS selection once and rejects it after a STOP", async () => {
    await importOwner();
    await checked(db.from("people").update({primary_phone:"0612345678"}).eq("tenant_id",tenant).eq("id",person));
    const preview = await previewVscSmsAudience(tenant);
    expect(preview).toMatchObject({recipients:1,emailMobile:1,mobileOnly:0,sendingEnabled:false});
    const saved = await Promise.all([saveVscSmsAudience(tenant,approvalActor,preview.reviewKey),saveVscSmsAudience(tenant,approvalActor,preview.reviewKey)]);
    expect(saved[0].id).toBe(saved[1].id);
    expect(saved.filter(x=>x.reused)).toHaveLength(1);
    expect(await checked(db.from("vsc_sms_audience_drafts").select("id").eq("tenant_id",tenant))).toHaveLength(1);
    expect(await checked(db.from("vsc_campaigns").select("id").eq("tenant_id",tenant))).toHaveLength(1);
    expect(await checked(db.from("vsc_campaign_deliveries").select("id").eq("tenant_id",tenant))).toHaveLength(3);
    await unsubscribeVscContact(tenant,person,"sms");
    await expect(saveVscSmsAudience(tenant,approvalActor,preview.reviewKey)).rejects.toThrow("Sélection modifiée");
    expect(smtp.send).not.toHaveBeenCalled();
  });
  it("imports concurrent identical source snapshots exactly once without sending or creating campaigns", async () => {
    await importOwner();
    const groups = groupVscBrevoContacts([normalizeVscBrevoContact({ id: 1, email: "import@fixture.invalid", emailBlacklisted: false, smsBlacklisted: true, attributes: { SMS: "0612345678" } })], id => vscBrevoImportPersonId(tenant, id));
    const results = await Promise.all([importVscBrevoContactGroups(tenant, approvalActor, groups), importVscBrevoContactGroups(tenant, approvalActor, groups)]);
    expect(results.reduce((n,r)=>n+r.created,0)).toBe(1); expect(results.reduce((n,r)=>n+r.matched,0)).toBe(1);
    expect(await checked(db.from("people").select("id").eq("tenant_id",tenant))).toHaveLength(2);
    expect(await checked(db.from("vsc_brevo_contact_links").select("provider_id").eq("tenant_id",tenant))).toHaveLength(1);
    expect(await checked(db.from("vsc_campaigns").select("id").eq("tenant_id",tenant))).toHaveLength(1);
    expect(await checked(db.from("vsc_campaign_deliveries").select("id").eq("tenant_id",tenant))).toHaveLength(3);
    expect(smtp.send).not.toHaveBeenCalled(); expect(inbox).not.toHaveBeenCalled();
  });
  it("preserves Atlas refusal and source exclusions across a later subscribed source snapshot", async () => {
    await importOwner();
    await checked(db.from("people").update({ contact_allowed: false }).eq("tenant_id",tenant).eq("id",person));
    const groups = (blocked: boolean) => groupVscBrevoContacts([normalizeVscBrevoContact({ id: 2, email: "shop@fixture.invalid", emailBlacklisted: blocked, smsBlacklisted: false })], id => vscBrevoImportPersonId(tenant,id));
    const stopped = await importVscBrevoContactGroups(tenant,approvalActor,groups(true)); expect(stopped.cancelled).toBe(1);
    await importVscBrevoContactGroups(tenant,approvalActor,groups(false));
    expect(await checked(db.from("people").select("contact_allowed").eq("tenant_id",tenant).eq("id",person).single())).toMatchObject({contact_allowed:false});
    expect(await checked(db.from("vsc_contact_suppressions").select("channel").eq("tenant_id",tenant).eq("person_id",person))).toContainEqual({channel:"email"});
    expect(await checked(db.from("vsc_brevo_contact_links").select("email_blocked").eq("tenant_id",tenant).single())).toMatchObject({email_blocked:true});
    expect(await checked(db.from("vsc_campaign_deliveries").select("status").eq("tenant_id",foreignTenant))).toEqual([{status:"scheduled"}]);
    expect(await checked(db.from("vsc_campaign_deliveries").select("status").eq("tenant_id",tenant).eq("channel","sms"))).toEqual([{status:"draft"}]);
    expect(smtp.send).not.toHaveBeenCalled();
  });

  it("blocks a new initial OVH reservation after historical Brevo evidence, without blocking follow-up reservation", async () => {
    await importOwner();
    const groups=groupVscBrevoContacts([normalizeVscBrevoContact({id:3,email:"shop@fixture.invalid",emailBlacklisted:false,smsBlacklisted:false})],id=>vscBrevoImportPersonId(tenant,id));
    await importVscBrevoContactGroups(tenant,approvalActor,groups);
    await checked(db.rpc("vsc_record_brevo_history",{p_tenant_id:tenant,p_actor_id:approvalActor,p_entries:[{provider_id:3,person_id:person,email:"shop@fixture.invalid",sentAt:"2026-10-26T09:48:00Z",delivered:true,hardBounce:false,softBounce:false,emailBlocked:false}]}));
    const followup=await scheduledEmail();
    const initial=await checked(db.from("vsc_campaign_deliveries").update({status:"scheduled",provider_message_id:null,scheduled_at:new Date(Date.now()-60000).toISOString()}).eq("tenant_id",tenant).eq("step_key","offer").select("id").single());
    expect(await reserveVscEmail(tenant,initial!.id)).toBeNull();
    expect(await reserveVscEmail(tenant,followup)).not.toBeNull();
    expect(await checked(db.rpc("vsc_email_draft_contacts",{p_tenant_id:tenant}))).toEqual([]);
    expect(smtp.send).not.toHaveBeenCalled();
  });

  it.skipIf(Date.now()>=Date.parse("2026-11-15T08:30:00Z"))("saves concurrent historical J20 plans once, without an initial email or activation",async()=>{
    await importOwner();
    const groups=groupVscBrevoContacts([normalizeVscBrevoContact({id:4,email:"shop@fixture.invalid",emailBlacklisted:false,smsBlacklisted:false})],id=>vscBrevoImportPersonId(tenant,id));
    await importVscBrevoContactGroups(tenant,approvalActor,groups);
    await checked(db.rpc("vsc_record_brevo_history",{p_tenant_id:tenant,p_actor_id:approvalActor,p_entries:[{provider_id:4,person_id:person,email:"shop@fixture.invalid",sentAt:"2026-10-26T09:48:00Z",delivered:true,hardBounce:false,softBounce:false,emailBlocked:false}]}));
    const contacts=await checked(db.rpc("vsc_historical_followup_contacts",{p_tenant_id:tenant}));
    expect(contacts).toHaveLength(1);
    const draft=randomUUID(),params={p_tenant_id:tenant,p_actor_id:approvalActor,p_campaign_id:draft,p_name:"Historical fixture",p_plan:contacts!.map((c:{id:string;email:string;scheduled_at:string})=>({id:c.id,email:c.email,scheduled_at:c.scheduled_at})),p_content:defaultVscEmailContent()};
    const results=await Promise.all([checked(db.rpc("vsc_save_historical_followup",params)),checked(db.rpc("vsc_save_historical_followup",params))]);
    expect(results.filter(r=>r.reused===false)).toHaveLength(1);expect(results.filter(r=>r.reused===true)).toHaveLength(1);
    expect(await checked(db.from("vsc_campaign_deliveries").select("step_key,status,historical_brevo_campaign_id,scheduled_at").eq("tenant_id",tenant).eq("campaign_id",draft))).toEqual([{step_key:"consideration",status:"draft",historical_brevo_campaign_id:2,scheduled_at:"2026-11-15T08:30:00+00:00"}]);
    expect(await checked(db.from("vsc_campaigns").select("state,approved_at,enabled_at").eq("tenant_id",tenant).eq("id",draft).single())).toEqual({state:"draft",approved_at:null,enabled_at:null});
    expect(await checked(db.rpc("vsc_historical_followup_contacts",{p_tenant_id:tenant}))).toEqual([]);expect(smtp.send).not.toHaveBeenCalled();
  });

  it("applies a provider SMS STOP to phone aliases, preserves email drafts and never reactivates it",async()=>{
    await importOwner();await checked(db.from("people").update({primary_phone:"06 12 34 56 78"}).eq("tenant_id",tenant).eq("id",person));
    const alias=randomUUID();await checked(db.from("people").insert({id:alias,tenant_id:tenant,display_name:"SMS alias",primary_phone:"+33612345678",contact_allowed:true}));
    const groups=groupVscBrevoContacts([normalizeVscBrevoContact({id:5,email:"shop@fixture.invalid",attributes:{SMS:"0612345678"},emailBlacklisted:false,smsBlacklisted:false})],id=>vscBrevoImportPersonId(tenant,id));
    // The import stages the ambiguous identity, retaining both canonical phone candidates for STOP propagation.
    await importVscBrevoContactGroups(tenant,approvalActor,groups);
    await checked(db.from("vsc_campaign_deliveries").insert({tenant_id:tenant,campaign_id:campaign,person_id:alias,channel:"sms",step_key:"alias-sms",scheduled_at:"2026-11-01T12:00:00Z",status:"draft"}));
    const first=await checked(db.rpc("vsc_apply_brevo_sms_stops",{p_tenant_id:tenant,p_actor_id:approvalActor,p_source_ids:[5]}));expect(first.cancelled).toBe(2);expect(first.peopleStopped).toBe(2);
    const email=await checked(db.from("vsc_campaign_deliveries").select("status").eq("tenant_id",tenant).eq("channel","email"));expect(email!.map(r=>r.status).sort()).toEqual(["draft","sent"]);
    const second=await checked(db.rpc("vsc_apply_brevo_sms_stops",{p_tenant_id:tenant,p_actor_id:approvalActor,p_source_ids:[]}));expect(second.cancelled).toBe(0);expect(second.peopleStopped).toBe(2);
    expect((await getVscSmsDraftContacts(tenant)).contacts).toEqual([]);expect(smtp.send).not.toHaveBeenCalled();
  });

  async function scheduledEmail() {
    await checked(db.from("vsc_campaigns").update({ state: "active", approved_by: approvalActor, approved_at: new Date().toISOString(), enabled_at: new Date().toISOString(), email_content: defaultVscEmailContent() }).eq("tenant_id", tenant).eq("id", campaign));
    const row = await checked(db.from("vsc_campaign_deliveries").update({ status: "scheduled", scheduled_at: new Date(Date.now()-60000).toISOString() }).eq("tenant_id", tenant).eq("campaign_id", campaign).eq("step_key", "consideration").select("id").single());
    if (!row) throw new Error("Scheduled fixture unavailable");
    return row.id as string;
  }
  function enableFakeSmtp() {
    vi.stubEnv("VSC_EMAIL_DISPATCH_ENABLED", "true"); vi.stubEnv("VSC_OVH_SMTP_PASSWORD", "synthetic-local-test-only");
    vi.stubEnv("VSC_UNSUBSCRIBE_SIGNING_KEY", "synthetic-local-signing-key-not-a-real-secret-0123456789");
    vi.stubEnv("VSC_PUBLIC_BASE_URL", "https://vsc.fixture.invalid");
    smtp.enabled = true;
    smtp.send.mockImplementation(async (mail: { messageId: string; envelope: { to: string[] } }) => ({ messageId: mail.messageId, accepted: mail.envelope.to, rejected: [], response: "250 accepted by simulated SMTP" }));
  }
  it("reads deduplicated VSC mobiles and honors an opposition on another formatting of the same number", async () => {
    await checked(db.from("people").update({ primary_phone: "06 12 34 56 78" }).eq("tenant_id", tenant).eq("id", person));
    const alias = randomUUID();
    await checked(db.from("people").insert({ id: alias, tenant_id: tenant, display_name: "Alias fixture", primary_phone: "+33612345678", contact_allowed: true }));
    const result = await getVscSmsDraftContacts(tenant);
    expect(result.contacts).toHaveLength(1); expect(result.contacts[0]).toMatchObject({ id: person, mobile: "+33612345678", has_email: true });
    await unsubscribeVscContact(tenant, alias, "sms");
    expect((await getVscSmsDraftContacts(tenant)).contacts).toEqual([]);
    await expect(getVscSmsDraftContacts(foreignTenant)).rejects.toThrow("non autorisée");
    expect(smtp.send).not.toHaveBeenCalled();
  });
  it.skipIf(promotionExpired)("persists immutable SMS copy versions without recipients or deliveries and handles concurrent retries", async () => {
    const input = { id: randomUUID(), name: "SMS copy fixture", startDate: new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date()), hasEmail: false, messages: defaultVscSmsContent() };
    const before = await checked(db.from("vsc_campaign_deliveries").select("id").eq("tenant_id", tenant));
    await Promise.all([saveVscSmsCopy(tenant, input), saveVscSmsCopy(tenant, input)]);
    const copies = await listVscSmsCopies(tenant);
    expect(copies.drafts).toHaveLength(1); expect(copies.drafts[0].messages).toEqual(input.messages);
    await expect(saveVscSmsCopy(tenant, { ...input, name: "Changed identity" })).rejects.toThrow("autre contenu");
    await expect(listVscSmsCopies(foreignTenant)).rejects.toThrow("non autorisée");
    expect(await checked(db.from("vsc_campaign_deliveries").select("id").eq("tenant_id", tenant))).toHaveLength(before!.length);
    expect(smtp.send).not.toHaveBeenCalled();
  });
  it.skipIf(promotionExpired)("reads unfinished and uncertain attempts without changing state or exposing reservation secrets", async () => {
    const id = await scheduledEmail();
    const reservation = await reserveVscEmail(tenant, id); expect(reservation).not.toBeNull();
    expect((await getVscDispatchReview(tenant)).rows).toEqual([]);
    await beginVscEmail(tenant, id, reservation!.claimToken);
    const started = await getVscDispatchReview(tenant);
    expect(started.rows).toHaveLength(1); expect(started.rows[0]).toMatchObject({ deliveryId: id, outcome: "sending", messageId: `<vsc-${id}@vendresoncommerce.com>` });
    expect(JSON.stringify(started)).not.toContain(reservation!.claimToken);
    await recordVscEmailResult(tenant, id, reservation!.claimToken, "unknown");
    const uncertain = await getVscDispatchReview(tenant);
    expect(uncertain.rows).toHaveLength(1); expect(uncertain.rows[0].outcome).toBe("unknown");
    await expect(getVscDispatchReview(foreignTenant)).rejects.toThrow("non autorisée");
    const row = await checked(db.from("vsc_campaign_deliveries").select("status,dispatch_outcome,claim_token").eq("tenant_id", tenant).eq("id", id).single());
    expect(row).toEqual({ status: "claimed", dispatch_outcome: "unknown", claim_token: reservation!.claimToken });
    expect(smtp.send).not.toHaveBeenCalled();
  });
  it("leaves the delivery untouched while commercial dispatch is disabled", async () => {
    const id = await scheduledEmail();
    vi.stubEnv("VSC_EMAIL_DISPATCH_ENABLED", "");
    expect(await dispatchReservedVscEmail(tenant, id)).toEqual({ state: "disabled" }); expect(smtp.send).not.toHaveBeenCalled();
    const row = await checked(db.from("vsc_campaign_deliveries").select("status,claim_token").eq("tenant_id", tenant).eq("id", id).single());
    expect(row).toEqual({ status: "scheduled", claim_token: null });
  });
  it.skipIf(promotionExpired)("runs the real reserved adapter with simulated SMTP, persists its receipt and cannot resend", async () => {
    const id = await scheduledEmail(); enableFakeSmtp();
    expect(await dispatchReservedVscEmail(tenant, id)).toEqual({ state: "sent" });
    expect(await dispatchReservedVscEmail(tenant, id)).toEqual({ state: "not_eligible" }); expect(smtp.send).toHaveBeenCalledTimes(1);
    const mail = smtp.send.mock.calls[0][0];
    expect(mail.messageId).toBe(`<vsc-${id}@vendresoncommerce.com>`); expect(mail.envelope.to).toEqual(["shop@fixture.invalid"]);
    const url = new URL(mail.text.split("\n").at(-1)!.replace("Ne plus recevoir nos emails : ", ""));
    expect(verifyVscUnsubscribeToken(url.searchParams.get("token")!)).toEqual({ v: 1, tenantId: tenant, personId: person, channel: "email" });
    const row = await checked(db.from("vsc_campaign_deliveries").select("status,provider_message_id,dispatch_outcome").eq("tenant_id", tenant).eq("id", id).single());
    expect(row).toEqual({ status: "sent", provider_message_id: mail.messageId, dispatch_outcome: "sent" });
  });
  it.skipIf(promotionExpired)("keeps a simulated SMTP timeout uncertain through the real adapter and never retries it", async () => {
    const id = await scheduledEmail(); enableFakeSmtp(); smtp.send.mockRejectedValue({ code: "ETIMEDOUT", command: "DATA" });
    expect((await dispatchReservedVscEmail(tenant, id)).state).toBe("review_required");
    expect(await dispatchReservedVscEmail(tenant, id)).toEqual({ state: "not_eligible" }); expect(smtp.send).toHaveBeenCalledTimes(1);
    const row = await checked(db.from("vsc_campaign_deliveries").select("status,dispatch_outcome").eq("tenant_id", tenant).eq("id", id).single());
    expect(row).toEqual({ status: "claimed", dispatch_outcome: "unknown" });
  });
  it.skipIf(promotionExpired)("persists a proven simulated SMTP rejection without any automatic retry", async () => {
    const id = await scheduledEmail(); enableFakeSmtp(); smtp.send.mockRejectedValue({ code: "EENVELOPE", command: "RCPT TO", responseCode: 550, response: "550 refused by simulated SMTP" });
    expect(await dispatchReservedVscEmail(tenant, id)).toEqual({ state: "rejected" });
    expect(await dispatchReservedVscEmail(tenant, id)).toEqual({ state: "not_eligible" }); expect(smtp.send).toHaveBeenCalledTimes(1);
    const row = await checked(db.from("vsc_campaign_deliveries").select("status,dispatch_outcome").eq("tenant_id", tenant).eq("id", id).single());
    expect(row).toEqual({ status: "failed", dispatch_outcome: "rejected" });
  });
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
