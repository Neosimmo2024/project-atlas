/** QA-only, explicit two-message self-test. Never sends to a prospect. */
import { randomUUID } from "node:crypto";
import type { TenantContext } from "@/types/domain";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { canManageOvh, createOvhTransport, OVH_SENDER } from "./ovh-connection";
import { getVscInboxCheckpoint } from "./vsc-ovh-imap";
import { loadVscImapCursor, saveVscImapCursor } from "./vsc-imap-cursor";
import { reconcileVscRepliesOnce } from "./vsc-reply-worker";
const TEST_NAME = "[TEST TECHNIQUE OVH] Réponse et arrêt des relances";
export function canRunVscReplySelfTest(context: TenantContext) {
  try {
    return canManageOvh(context) && process.env.VERCEL_ENV === "preview" &&
      process.env.VSC_REPLY_SELF_TEST_ENABLED === "true" &&
      new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname === "mahgxumwucxehsooijag.supabase.co";
  } catch { return false; }
}
async function checked<T>(request: PromiseLike<{ data: T; error: { message: string } | null }>) {
  const result = await request; if (result.error) throw new Error(result.error.message); return result.data;
}
export async function verifyVscReplySelfTest(context: TenantContext, resumeId?: string) {
  if (!canRunVscReplySelfTest(context)) return { success: false, pending: false, error: "Test réservé à la prévisualisation QA VendreSonCommerce." };
  const db = createSupabaseServiceRoleClient(); const tenantId = context.tenantId;
  let testId = resumeId;
  try {
    if (!testId) {
      const existing = await checked(db.from("vsc_campaign_deliveries").select("id").eq("tenant_id", tenantId).eq("status", "sent").limit(1));
      if (existing?.length) throw new Error("Existing sends: no checkpoint reset permitted");
      const password = process.env.VSC_OVH_SMTP_PASSWORD;
      if (!password) throw new Error("SMTP not configured");
      const previous = await loadVscImapCursor(tenantId);
      const checkpoint = await getVscInboxCheckpoint();
      // No historical sends exist: no earlier campaign reply can be skipped.
      await saveVscImapCursor(tenantId, previous, { ...checkpoint, scanned: 0, hasMore: false, envelopes: [] });
      testId = randomUUID(); const personId = randomUUID(); const originalId = randomUUID();
      const originalMessageId = `<atlas-vsc-original-${randomUUID()}@vendresoncommerce.com>`;
      const replyMessageId = `<atlas-vsc-reply-${randomUUID()}@vendresoncommerce.com>`;
      await checked(db.from("people").insert({ id: personId, tenant_id: tenantId, display_name: "TEST TECHNIQUE OVH — aucun contact commercial", primary_email: OVH_SENDER, do_not_contact: true, contact_allowed: false, source: "vsc-reply-self-test" }));
      await checked(db.from("vsc_campaigns").insert({ id: testId, tenant_id: tenantId, name: TEST_NAME }));
      await checked(db.from("vsc_campaign_deliveries").insert([
        { id: originalId, tenant_id: tenantId, campaign_id: testId, person_id: personId, channel: "email", step_key: "technical-original", status: "claimed", scheduled_at: new Date().toISOString() },
        { tenant_id: tenantId, campaign_id: testId, person_id: personId, channel: "email", step_key: "technical-followup", status: "draft", scheduled_at: new Date().toISOString() },
        { tenant_id: tenantId, campaign_id: testId, person_id: personId, channel: "email", step_key: "technical-reply", status: "claimed", scheduled_at: new Date().toISOString() }
      ]));
      const transport = createOvhTransport(password);
      try {
        const original = await transport.sendMail({
          from: { name: "VendreSonCommerce — test technique", address: OVH_SENDER }, to: OVH_SENDER, replyTo: OVH_SENDER, messageId: originalMessageId,
          subject: "Test technique Atlas — reconnaissance d’une réponse", text: "Message de test adressé uniquement à notre propre boîte OVH. Aucun prospect, aucune offre commerciale, aucune campagne activée."
        });
        if (!original.accepted?.some(a => typeof a === "string" && a.toLowerCase() === OVH_SENDER)) throw new Error("SMTP not accepted");
        await checked(db.from("vsc_campaign_deliveries").update({ status: "sent", provider_message_id: originalMessageId }).eq("tenant_id", tenantId).eq("id", originalId));
        const reply = await transport.sendMail({
          from: { name: "VendreSonCommerce — réponse de test", address: OVH_SENDER }, to: OVH_SENDER, replyTo: OVH_SENDER,
          messageId: replyMessageId, inReplyTo: originalMessageId, references: [originalMessageId],
          subject: "Re: Test technique Atlas — reconnaissance d’une réponse", text: "Réponse technique fictive pour vérifier la reconnaissance IMAP et l’arrêt d’une relance de test. Aucun envoi commercial."
        });
        if (!reply.accepted?.some(a => typeof a === "string" && a.toLowerCase() === OVH_SENDER)) throw new Error("Reply not accepted");
        await checked(db.from("vsc_campaign_deliveries").update({ status: "sent", provider_message_id: replyMessageId }).eq("tenant_id", tenantId).eq("campaign_id", testId).eq("step_key", "technical-reply"));
      } finally { transport.close(); }
    }
    const campaign = await checked(db.from("vsc_campaigns").select("id,name,state,approved_at,enabled_at").eq("tenant_id", tenantId).eq("id", testId).maybeSingle());
    if (!campaign || campaign.name !== TEST_NAME || campaign.state !== "draft" || campaign.approved_at || campaign.enabled_at) throw new Error("Invalid test campaign");
    const replyDelivery = await checked(db.from("vsc_campaign_deliveries").select("person_id,provider_message_id,status").eq("tenant_id", tenantId).eq("campaign_id", testId).eq("step_key", "technical-reply").single());
    if (!replyDelivery?.provider_message_id || replyDelivery.status !== "sent") throw new Error("Reply not persisted; never resend automatically");
    await reconcileVscRepliesOnce(tenantId);
    const [journal, followup] = await Promise.all([
      checked(db.from("vsc_inbound_replies").select("id").eq("tenant_id", tenantId).eq("campaign_id", testId).eq("provider_message_id", replyDelivery.provider_message_id).maybeSingle()),
      checked(db.from("vsc_campaign_deliveries").select("status").eq("tenant_id", tenantId).eq("campaign_id", testId).eq("step_key", "technical-followup").single())
    ]);
    if (journal && followup?.status === "cancelled") return { success: true, pending: false, testId, message: "Test complet réussi : réponse OVH reconnue, journal enregistré et relance fictive annulée. Aucune campagne commerciale activée." };
    return { success: false, pending: true, testId, message: "Les deux messages techniques sont envoyés. La réponse n’est pas encore traitée. Reprendre la vérification ne renverra aucun message." };
  } catch {
    return { success: false, pending: false, testId, error: "Test interrompu. Des messages techniques peuvent avoir été acceptés par OVH. Aucun renvoi automatique ; vérifier le diagnostic avant de recommencer." };
  }
}
