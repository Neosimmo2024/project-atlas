/**
 * Server-only draft persistence. This module is intentionally not exposed
 * through an API route or scheduler. It cannot activate or send campaigns.
 */
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { isVscCalendarDate, VSC_OFFER_END } from "@/features/vsc-campaign/policy";
import type { VscPlannedDelivery } from "@/features/vsc-campaign/review-plan";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function saveVscDraftPlan(input: {
  tenantId: string;
  campaignId: string;
  plan: VscPlannedDelivery[];
}): Promise<{ submitted: number }> {
  if (!UUID.test(input.tenantId) || !UUID.test(input.campaignId))
    throw new Error("Identifiants invalides");
  if (input.plan.length > 500) throw new Error("Lot trop important");
  if (input.plan.some(item =>
    item.tenantId !== input.tenantId || !UUID.test(item.leadId) ||
    item.status !== "draft" || !["email", "sms"].includes(item.channel) ||
    !isVscCalendarDate(item.scheduledDate) ||
    item.scheduledDate > VSC_OFFER_END
  )) throw new Error("Plan invalide ou entreprise incorrecte");

  const supabase = createSupabaseServiceRoleClient();
  const { data: campaign, error: campaignError } = await supabase
    .from("vsc_campaigns").select("id,tenant_id,state")
    .eq("id", input.campaignId).eq("tenant_id", input.tenantId).maybeSingle();
  if (campaignError) throw campaignError;
  if (!campaign || campaign.state !== "draft") throw new Error("Campagne non modifiable");
  if (!input.plan.length) return { submitted: 0 };

  const { data: people, error: peopleError } = await supabase.from("people")
    .select("id").eq("tenant_id", input.tenantId)
    .in("id", [...new Set(input.plan.map(x => x.leadId))]);
  if (peopleError) throw peopleError;
  if (new Set((people ?? []).map(x => x.id)).size !== new Set(input.plan.map(x => x.leadId)).size)
    throw new Error("Prospect étranger au compte");

  const { error } = await supabase.from("vsc_campaign_deliveries").upsert(
    input.plan.map(item => ({
      tenant_id: input.tenantId, campaign_id: input.campaignId,
      person_id: item.leadId, channel: item.channel,
      step_key: item.stepKey, scheduled_at: item.scheduledDate + "T12:00:00Z",
      status: "draft"
    })),
    { onConflict: "tenant_id,campaign_id,person_id,step_key", ignoreDuplicates: true }
  );
  if (error) throw error;
  return { submitted: input.plan.length };
}
