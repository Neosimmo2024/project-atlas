/** Read-only VSC candidates, not an authorization to dispatch or a saved selection. */
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
export type VscSmsDraftContact = { id: string; display_name: string; mobile: string; has_email: boolean };
export async function getVscSmsDraftContacts(tenantId: string) {
  if (!tenantId || tenantId !== process.env.VSC_OVH_TENANT_ID?.trim() || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId))
    throw new Error("Entreprise non autorisée");
  const { data, error } = await createSupabaseServiceRoleClient().rpc("vsc_sms_draft_contacts", { p_tenant_id: tenantId });
  if (error) throw new Error("Lecture des mobiles VSC indisponible");
  const rows = (data ?? []) as VscSmsDraftContact[];
  return { contacts: rows.slice(0, 100), truncated: rows.length > 100, sendingEnabled: false as const };
}
