/**
 * VSC campaign dashboard counts, scoped to one tenant.
 * Read-only: no email sending, no scheduling, no state changes.
 */
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export async function getVscCampaignSummary(tenantId: string) {
  if (!tenantId || tenantId !== process.env.VSC_OVH_TENANT_ID?.trim())
    throw new Error("Entreprise non autorisée");

  const supabase = createSupabaseServiceRoleClient();
  const [{ data: campaigns, error: campaignError },
    { data: deliveries, error: deliveryError },
    { count: replies, error: replyError }] = await Promise.all([
    supabase.from("vsc_campaigns").select("id,state").eq("tenant_id", tenantId).limit(500),
    supabase.from("vsc_campaign_deliveries").select("id,status,channel").eq("tenant_id", tenantId).limit(5000),
    supabase.from("vsc_inbound_replies").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId)
  ]);
  if (campaignError) throw campaignError;
  if (deliveryError) throw deliveryError;
  if (replyError) throw replyError;

  const count = (status: string) => (deliveries ?? []).filter(row => row.status === status).length;
  return {
    campaigns: (campaigns ?? []).length,
    draft: count("draft"),
    scheduled: count("scheduled"),
    sent: count("sent"),
    failed: count("failed"),
    cancelled: count("cancelled"),
    replies: replies ?? 0,
    truncated: (campaigns ?? []).length === 500 || (deliveries ?? []).length === 5000
  };
}
