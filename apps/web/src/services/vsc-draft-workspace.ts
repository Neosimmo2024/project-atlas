/** VSC email preparation only. All records stay draft; no provider is called. */
import { createHash } from "node:crypto";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { buildVscReviewPlan } from "@/features/vsc-campaign/review-plan";
import { isVscCalendarDate, VSC_OFFER_END } from "@/features/vsc-campaign/policy";

import { defaultVscEmailContent, validateVscEmailContent, type VscEmailContent } from "@/features/vsc-campaign/email-content";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type VscDraftContact = { id: string; display_name: string; primary_email: string };
export type VscDraftRequest = { campaignId: string; name: string; startDate: string; personIds: string[]; content: VscEmailContent };
export class VscDraftInputError extends Error {}
export function vscDraftToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  return ["year", "month", "day"].map(type => parts.find(p => p.type === type)?.value).join("-");
}
function assertTenant(tenantId: string) {
  if (!UUID.test(tenantId) || tenantId !== process.env.VSC_OVH_TENANT_ID?.trim()) throw new Error("Entreprise non autorisée");
}
export function validateVscDraftRequest(input: unknown): VscDraftRequest {
  const value = input as Partial<VscDraftRequest> | null;
  if (!value || typeof value.campaignId !== "string" || !UUID.test(value.campaignId)
    || typeof value.name !== "string" || !value.name.trim() || value.name.trim().length > 150
    || typeof value.startDate !== "string" || !isVscCalendarDate(value.startDate)
    || value.startDate < vscDraftToday() || value.startDate > VSC_OFFER_END
    || !Array.isArray(value.personIds) || !value.personIds.length || value.personIds.length > 100
    || value.personIds.some(id => typeof id !== "string" || !UUID.test(id))
    || new Set(value.personIds).size !== value.personIds.length)
    throw new VscDraftInputError("Nom, date ou sélection de contacts invalide.");
  let content: VscEmailContent;
  try { content = validateVscEmailContent(value.content ?? defaultVscEmailContent()); }
  catch (error) { throw new VscDraftInputError(error instanceof Error ? error.message : "Textes invalides."); }
  return { campaignId: value.campaignId, name: value.name.trim(), startDate: value.startDate, personIds: [...value.personIds].sort(), content };
}
async function eligibleContacts(tenantId: string, personIds?: string[]) {
  const { data, error } = await createSupabaseServiceRoleClient().rpc("vsc_email_draft_contacts", {
    p_tenant_id: tenantId, p_person_ids: personIds ?? null
  });
  if (error) throw new Error("Contrôle des contacts indisponible");
  const rows = (data ?? []) as VscDraftContact[];
  return { contacts: rows.slice(0, 100), limited: rows.length > 100 };
}
export async function getVscDraftWorkspace(tenantId: string) {
  assertTenant(tenantId);
  const db = createSupabaseServiceRoleClient();
  const [selection, campaigns] = await Promise.all([
    eligibleContacts(tenantId),
    db.from("vsc_campaigns").select("id,name,state,created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(20)
  ]);
  if (campaigns.error) throw new Error("Brouillons indisponibles");
  return { ...selection, campaigns: campaigns.data ?? [], defaultContent: defaultVscEmailContent() };
}
export async function previewVscEmailDraft(tenantId: string, raw: unknown) {
  assertTenant(tenantId);
  const input = validateVscDraftRequest(raw);
  const { contacts } = await eligibleContacts(tenantId, input.personIds);
  if (contacts.length !== input.personIds.length) throw new VscDraftInputError("Un contact n’est plus éligible. Rechargez la sélection.");
  const plan = buildVscReviewPlan({ tenantId, campaignState: "draft", startDate: input.startDate, leads: contacts.map(person => ({
    id: person.id, tenantId, unsubscribed: false,
    contact: { email: person.primary_email, mobile: null, doNotContact: false, emailOptOut: false, smsOptOut: true, replied: false, appointmentBooked: false, purchased: false }
  })) });
  const reviewKey = createHash("sha256").update(JSON.stringify({ input, plan, contacts })).digest("hex");
  return { input, plan, reviewKey, contacts, content: input.content, sendingEnabled: false as const };
}
export async function saveVscEmailDraft(tenantId: string, raw: unknown, reviewKey: unknown) {
  const preview = await previewVscEmailDraft(tenantId, raw);
  if (typeof reviewKey !== "string" || reviewKey !== preview.reviewKey) throw new VscDraftInputError("L’aperçu a changé. Vérifiez-le avant d’enregistrer.");
  const { data, error } = await createSupabaseServiceRoleClient().rpc("vsc_create_email_draft_with_content", {
    p_tenant_id: tenantId, p_campaign_id: preview.input.campaignId, p_name: preview.input.name,
    p_start_date: preview.input.startDate, p_person_ids: preview.input.personIds, p_content: preview.input.content
  });
  if (error) throw new Error("Sauvegarde indisponible. Vous pouvez réessayer le même brouillon.");
  return data as { campaignId: string; submitted: number; reused: boolean };
}

/** Tenant-scoped readback of the saved copy, without regenerating current templates. */
export async function readVscEmailDraft(tenantId: string, campaignId: string) {
  assertTenant(tenantId);
  if (!UUID.test(campaignId)) throw new VscDraftInputError("Identifiant de brouillon invalide.");
  const db = createSupabaseServiceRoleClient();
  const [campaign, deliveries] = await Promise.all([
    db.from("vsc_campaigns").select("id,name,state,email_content").eq("tenant_id", tenantId).eq("id", campaignId).maybeSingle(),
    db.from("vsc_campaign_deliveries").select("step_key,scheduled_at,status,channel").eq("tenant_id", tenantId).eq("campaign_id", campaignId).order("scheduled_at").limit(501)
  ]);
  if (campaign.error || deliveries.error) throw new Error("Lecture du brouillon indisponible");
  if (!campaign.data) throw new VscDraftInputError("Brouillon introuvable dans cet espace.");
  return { campaign: { ...campaign.data, email_content: campaign.data.email_content === null ? null : validateVscEmailContent(campaign.data.email_content) }, deliveries: (deliveries.data ?? []).slice(0, 500), limited: (deliveries.data?.length ?? 0) > 500 };
}
