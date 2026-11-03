/** Read-only investigation queue. Never releases reservations or changes outcomes. */
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export type VscDispatchReviewRow = {
  deliveryId: string; campaignId: string; personId: string;
  startedAt: string | null; outcome: "sending" | "unknown"; messageId: string;
};

export async function getVscDispatchReview(tenantId: string): Promise<{ rows: VscDispatchReviewRow[]; truncated: boolean }> {
  if (!tenantId || tenantId !== process.env.VSC_OVH_TENANT_ID?.trim() ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId))
    throw new Error("Entreprise non autorisée");
  const { data, error } = await createSupabaseServiceRoleClient().from("vsc_campaign_deliveries")
    .select("id,campaign_id,person_id,dispatch_started_at,dispatch_outcome")
    .eq("tenant_id", tenantId).eq("channel", "email").eq("status", "claimed")
    .in("dispatch_outcome", ["sending", "unknown"])
    .order("dispatch_started_at", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true }).limit(51);
  if (error) throw new Error("Vérification des tentatives temporairement indisponible");
  return {
    rows: (data ?? []).slice(0, 50).map(row => ({
      deliveryId: row.id, campaignId: row.campaign_id, personId: row.person_id,
      startedAt: row.dispatch_started_at, outcome: row.dispatch_outcome as "sending" | "unknown",
      messageId: `<vsc-${row.id}@vendresoncommerce.com>`
    })),
    truncated: (data ?? []).length > 50
  };
}
