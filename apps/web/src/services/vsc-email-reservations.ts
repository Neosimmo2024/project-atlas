/** Inert server preparation. No route or scheduler calls this module. The reserved SMTP adapter is disabled by default. */
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type VscReservedPayload = { deliveryId: string; campaignId: string; personId: string; recipient: string; subject: string; text: string; messageId: string };
export type VscEmailReservation = { deliveryId: string; claimToken: string; payload: VscReservedPayload };
function args(tenantId: string, deliveryId: string, claimToken?: string) {
  if (tenantId !== process.env.VSC_OVH_TENANT_ID?.trim() || !UUID.test(tenantId) || !UUID.test(deliveryId) || (claimToken !== undefined && !UUID.test(claimToken))) throw new Error("Réservation VSC non autorisée");
  return { p_tenant_id: tenantId, p_delivery_id: deliveryId, ...(claimToken === undefined ? {} : { p_claim_token: claimToken }) };
}
export async function reserveVscEmail(tenantId: string, deliveryId: string): Promise<VscEmailReservation | null> {
  const input = args(tenantId, deliveryId);
  const { data, error } = await createSupabaseServiceRoleClient().rpc("vsc_reserve_email_delivery", input);
  if (error) throw new Error("Réservation VSC indisponible");
  return data as VscEmailReservation | null;
}
export async function beginVscEmail(tenantId: string, deliveryId: string, claimToken: string): Promise<VscReservedPayload | null> {
  const input = args(tenantId, deliveryId, claimToken);
  const { data, error } = await createSupabaseServiceRoleClient().rpc("vsc_begin_email_dispatch", input);
  if (error) throw new Error("Début de traitement VSC indisponible");
  return data as VscReservedPayload | null;
}
export async function releaseVscEmail(tenantId: string, deliveryId: string, claimToken: string): Promise<boolean> {
  const input = args(tenantId, deliveryId, claimToken);
  const { data, error } = await createSupabaseServiceRoleClient().rpc("vsc_release_email_reservation", input);
  if (error) throw new Error("Libération VSC indisponible");
  return data === true;
}
export async function recordVscEmailResult(tenantId: string, deliveryId: string, claimToken: string, outcome: "sent" | "rejected" | "unknown", messageId?: string): Promise<boolean> {
  const input = args(tenantId, deliveryId, claimToken);
  if (!["sent", "rejected", "unknown"].includes(outcome) || (outcome === "sent" ? !messageId || messageId.length > 512 : messageId !== undefined)) throw new Error("Résultat VSC invalide");
  const { data, error } = await createSupabaseServiceRoleClient().rpc("vsc_record_email_dispatch_result", { ...input, p_result: outcome, p_message_id: messageId ?? null });
  if (error) throw new Error("Résultat VSC à vérifier manuellement");
  return data === true;
}

/** Refresh state and eligibility immediately before the reserved adapter's provider call. */
export async function refreshVscEmail(tenantId: string, deliveryId: string, claimToken: string): Promise<VscReservedPayload | null> {
  args(tenantId, deliveryId, claimToken);
  const db = createSupabaseServiceRoleClient();
  const current = await db.from("vsc_campaign_deliveries").select("status,claim_token,dispatch_outcome")
    .eq("tenant_id", tenantId).eq("id", deliveryId).maybeSingle();
  if (current.error) throw new Error("Vérification VSC indisponible");
  if (!current.data || current.data.status !== "claimed" || current.data.claim_token !== claimToken || current.data.dispatch_outcome !== "sending") return null;
  const { data, error } = await db.rpc("vsc_email_dispatch_payload", { p_tenant_id: tenantId, p_delivery_id: deliveryId });
  if (error) throw new Error("Vérification VSC indisponible");
  return data as VscReservedPayload | null;
}
