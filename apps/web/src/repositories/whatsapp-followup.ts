import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Interaction, TenantContext } from "@/types/domain";
export async function getWhatsAppFollowup(context: TenantContext, personId: string) {
  const supabase = await createSupabaseServerClient();
  const base = () => supabase.from("interactions").select("*").eq("tenant_id", context.tenantId).eq("person_id", personId).is("deleted_at", null).contains("metadata", { channel: "whatsapp_manual" });
  const [consent, history] = await Promise.all([
    base().in("metadata->>whatsapp_event", ["consent_granted", "consent_revoked"]).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1),
    base().order("created_at", { ascending: false }).order("id", { ascending: false }).limit(5)
  ]);
  if (consent.error) throw consent.error;
  if (history.error) throw history.error;
  return { consent: consent.data?.[0]?.metadata?.whatsapp_event === "consent_granted", history: (history.data ?? []) as Interaction[] };
}
