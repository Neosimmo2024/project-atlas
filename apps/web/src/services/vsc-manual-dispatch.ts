/** Owner/admin-only manual review and one-delivery dispatch. No scheduler calls this service. */
import { createHash } from "node:crypto";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import type { TenantContext } from "@/types/domain";
import { canManageOvh, verifyOvhConnection } from "@/services/ovh-connection";
import { reconcileVscRepliesOnce } from "@/services/vsc-reply-worker";
import { createVscUnsubscribeUrl } from "@/services/vsc-unsubscribe-token";
import { dispatchReservedVscEmail, type VscDispatchResult } from "@/services/vsc-reserved-ovh-dispatch";
import { validateVscEmailContent } from "@/features/vsc-campaign/email-content";
import { isVscOfferCurrent } from "@/features/vsc-campaign/policy";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@,;<>"\\]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,63}$/;
function assertTenant(tenantId: string) {
  if (!UUID.test(tenantId) || tenantId !== process.env.VSC_OVH_TENANT_ID?.trim()) throw new Error("Entreprise non autorisée");
}
type Campaign = { id: string; name: string; state: string; email_content: unknown; approved_by: string | null; approved_at: string | null; enabled_at: string | null };
type Delivery = { id: string; person_id: string; step_key: string; scheduled_at: string; status: string; channel: string; provider_message_id: string | null; dispatch_outcome: string | null; dispatch_started_at: string | null };
export async function listVscManualCampaigns(tenantId: string) {
  assertTenant(tenantId);
  const { data, error } = await createSupabaseServiceRoleClient().from("vsc_campaigns")
    .select("id,name,state,created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error("Campagnes VSC indisponibles");
  return { campaigns: data ?? [], dispatchEnabled: process.env.VSC_EMAIL_DISPATCH_ENABLED === "true" };
}
export async function getVscManualCampaignReview(tenantId: string, campaignId: string) {
  assertTenant(tenantId);
  if (!UUID.test(campaignId)) throw new Error("Campagne invalide");
  const db = createSupabaseServiceRoleClient();
  const [campaignResult, deliveriesResult] = await Promise.all([
    db.from("vsc_campaigns").select("id,name,state,email_content,approved_by,approved_at,enabled_at").eq("tenant_id", tenantId).eq("id", campaignId).maybeSingle(),
    db.from("vsc_campaign_deliveries").select("id,person_id,step_key,scheduled_at,status,channel,provider_message_id,dispatch_outcome,dispatch_started_at")
      .eq("tenant_id", tenantId).eq("campaign_id", campaignId).eq("channel", "email").order("scheduled_at").limit(501)
  ]);
  if (campaignResult.error || deliveriesResult.error) throw new Error("Relecture de campagne indisponible");
  const campaign = campaignResult.data as Campaign | null;
  const deliveries = (deliveriesResult.data ?? []) as Delivery[];
  if (!campaign) throw new Error("Campagne introuvable");
  if (!campaign.email_content) throw new Error("Cette campagne n’a pas de copie email enregistrée");
  const content = validateVscEmailContent(campaign.email_content);
  const limited = deliveries.length > 500;
  const rows = deliveries.slice(0, 500);
  const ids = [...new Set(rows.map(row => row.person_id))];
  const [peopleResult, suppressionResult, repliesResult] = ids.length ? await Promise.all([
    db.from("people").select("id,display_name,primary_email,contact_allowed,do_not_contact").eq("tenant_id", tenantId).in("id", ids),
    db.from("vsc_contact_suppressions").select("person_id,channel").eq("tenant_id", tenantId).in("person_id", ids).in("channel", ["all", "email"]),
    db.from("vsc_inbound_replies").select("person_id").eq("tenant_id", tenantId).in("person_id", ids)
  ]) : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
  if (peopleResult.error || suppressionResult.error || repliesResult.error) throw new Error("Vérification des destinataires indisponible");
  const people = new Map((peopleResult.data ?? []).map(person => [person.id, person]));
  const suppressed = new Set((suppressionResult.data ?? []).map(row => row.person_id));
  const replied = new Set((repliesResult.data ?? []).map(row => row.person_id));
  const now = Date.now();
  const dispatchEnabled = process.env.VERCEL_ENV === "production" && process.env.VSC_MANUAL_SEND_ENABLED === "true" && Boolean(process.env.VSC_OVH_SMTP_PASSWORD) && Boolean(process.env.VSC_UNSUBSCRIBE_SIGNING_KEY && process.env.VSC_UNSUBSCRIBE_SIGNING_KEY.length >= 32) && Boolean(process.env.VSC_PUBLIC_BASE_URL);
  const messages = new Map<string, (typeof content.messages)[number]>(content.messages.map(message => [message.stepKey, message]));
  const reviewedRows = rows.map(delivery => {
    const person = people.get(delivery.person_id);
    const message = messages.get(delivery.step_key);
    const recipient = person?.primary_email?.trim() ?? "";
    const due = Date.parse(delivery.scheduled_at) <= now;
    const eligible = Boolean(person && person.contact_allowed === true && person.do_not_contact !== true &&
      EMAIL.test(recipient) && !suppressed.has(delivery.person_id) && !replied.has(delivery.person_id));
    const clean = Boolean(delivery.channel === "email" && message && delivery.provider_message_id === null &&
      delivery.dispatch_outcome === null && delivery.dispatch_started_at === null &&
      ["draft", "scheduled"].includes(delivery.status) &&
      ["draft", "approved", "active"].includes(campaign.state));
    const snapshot = {
      campaignId: campaign.id, campaignState: campaign.state, deliveryId: delivery.id,
      deliveryStatus: delivery.status, personId: delivery.person_id, recipient,
      scheduledAt: delivery.scheduled_at, stepKey: delivery.step_key,
      subject: message?.subject ?? "", text: message?.text ?? "",
      contactAllowed: person?.contact_allowed ?? false, doNotContact: person?.do_not_contact ?? true,
      suppressed: suppressed.has(delivery.person_id), replied: replied.has(delivery.person_id),
      providerMessageId: delivery.provider_message_id, dispatchOutcome: delivery.dispatch_outcome,
      dispatchStartedAt: delivery.dispatch_started_at
    };
    const reviewKey = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
    const blockers = [
      !person ? "Contact introuvable" : null,
      !eligible ? "Contact non éligible ou consentement/opposition à vérifier" : null,
      !message ? "Texte de cette étape introuvable" : null,
      !clean ? "Campagne ou livraison déjà traitée / non disponible" : null,
      !due ? "Date prévue pas encore atteinte" : null,
      !isVscOfferCurrent(new Date()) ? "Promotion terminée" : null,
      !dispatchEnabled ? "Envoi manuel désactivé ou configuration de production incomplète" : null
    ].filter((value): value is string => Boolean(value));
    return {
      deliveryId: delivery.id, personId: delivery.person_id, displayName: person?.display_name ?? "Contact",
      recipient, stepKey: delivery.step_key, scheduledAt: delivery.scheduled_at,
      status: delivery.status, subject: message?.subject ?? "", text: message?.text ?? "",
      due, eligible, canSend: clean && eligible && due && dispatchEnabled && isVscOfferCurrent(new Date()),
      blockers, reviewKey
    };
  });
  return { campaign: { id: campaign.id, name: campaign.name, state: campaign.state }, rows: reviewedRows, limited, dispatchEnabled };
}
export async function sendOneVscEmailManually(input: {
  context: TenantContext; campaignId: string; deliveryId: string; reviewKey: string; confirmed: boolean;
}): Promise<VscDispatchResult> {
  const { context, campaignId, deliveryId, reviewKey, confirmed } = input;
  const tenantId = context.tenantId;
  assertTenant(tenantId);
  if (!canManageOvh(context)) return { state: "blocked", reason: "admin_required" };
  if (!confirmed || !UUID.test(campaignId) || !UUID.test(deliveryId) || !/^[a-f0-9]{64}$/.test(reviewKey))
    return { state: "blocked", reason: "explicit_confirmation_required" };
  if (process.env.VERCEL_ENV !== "production") return { state: "disabled", reason: "production_only" };
  const initialReview = await getVscManualCampaignReview(tenantId, campaignId);
  const initialRow = initialReview.rows.find(item => item.deliveryId === deliveryId);
  if (!initialRow || initialRow.reviewKey !== reviewKey || !initialRow.canSend) return { state: "not_eligible", reason: "review_changed_or_delivery_not_due" };
  const smtp = await verifyOvhConnection(context);
  if (!smtp.success) return { state: "blocked", reason: "smtp_verification_failed" };
  try {
    // Reconcile fresh replies before rechecking the recipient and reserving SMTP.
    const replies = await reconcileVscRepliesOnce(tenantId);
    if (replies.hasMore) return { state: "blocked", reason: "reply_sync_incomplete" };
  } catch { return { state: "blocked", reason: "reply_sync_failed" }; }
  const review = await getVscManualCampaignReview(tenantId, campaignId);
  const row = review.rows.find(item => item.deliveryId === deliveryId);
  if (!row || row.reviewKey !== reviewKey || !row.canSend) return { state: "not_eligible", reason: "reply_or_delivery_changed" };
  try { createVscUnsubscribeUrl(tenantId, row.personId); }
  catch { return { state: "blocked", reason: "unsubscribe_verification_failed" }; }
  const db = createSupabaseServiceRoleClient();
  const { data: campaign, error: campaignReadError } = await db.from("vsc_campaigns")
    .select("id,state,approved_by,approved_at,enabled_at")
    .eq("tenant_id", tenantId).eq("id", campaignId).maybeSingle();
  if (campaignReadError || !campaign) return { state: "blocked", reason: "campaign_unavailable" };
  const now = new Date().toISOString();
  if (campaign.state === "draft" || campaign.state === "approved") {
    const patch = campaign.state === "draft"
      ? { state: "active", approved_by: context.userId, approved_at: now, enabled_at: now }
      : { state: "active", enabled_at: now };
    const { data, error } = await db.from("vsc_campaigns").update(patch).eq("tenant_id", tenantId)
      .eq("id", campaignId).eq("state", campaign.state).select("id").maybeSingle();
    if (error || !data) return { state: "blocked", reason: "campaign_state_changed" };
  } else if (campaign.state !== "active" || !campaign.approved_by || !campaign.approved_at || !campaign.enabled_at) {
    return { state: "blocked", reason: "campaign_not_approved" };
  }
  const { data: delivery, error: deliveryError } = await db.from("vsc_campaign_deliveries")
    .update({ status: "scheduled" }).eq("tenant_id", tenantId).eq("campaign_id", campaignId).eq("id", deliveryId)
    .eq("channel", "email").in("status", ["draft", "scheduled"]).is("provider_message_id", null)
    .is("dispatch_outcome", null).is("dispatch_started_at", null).select("id").maybeSingle();
  if (deliveryError || !delivery) return { state: "blocked", reason: "delivery_state_changed" };
  if (!isVscOfferCurrent(new Date())) return { state: "blocked", reason: "offer_expired" };
  // One delivery only. No scheduler calls this route or the reserved SMTP adapter.
  return dispatchReservedVscEmail(tenantId, deliveryId, "manual");
}
