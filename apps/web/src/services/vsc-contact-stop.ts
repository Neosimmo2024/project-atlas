import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function assertContact(tenantId: string, personId: string) {
  if (!UUID.test(tenantId) || !UUID.test(personId) || tenantId !== process.env.VSC_OVH_TENANT_ID?.trim()) throw new Error("Contact VSC non autorisé");
}
export async function unsubscribeVscContact(tenantId: string, personId: string, channel: "all" | "email" | "sms") {
  assertContact(tenantId, personId);
  const { data, error } = await createSupabaseServiceRoleClient().rpc("vsc_unsubscribe_contact", { p_tenant_id: tenantId, p_person_id: personId, p_channel: channel });
  if (error) throw error;
  return { cancelled: Number(data) };
}
/** Fresh DB state is mandatory; an unavailable check must block the transport. */
export async function checkVscContactStop(tenantId: string, personId: string, email: string) {
  assertContact(tenantId, personId);
  const db = createSupabaseServiceRoleClient();
  const [person, suppression, reply] = await Promise.all([
    db.from("people").select("primary_email,do_not_contact,contact_allowed").eq("tenant_id", tenantId).eq("id", personId).maybeSingle(),
    db.from("vsc_contact_suppressions").select("channel").eq("tenant_id", tenantId).eq("person_id", personId).in("channel", ["all","email"]).limit(1),
    db.from("vsc_inbound_replies").select("id").eq("tenant_id", tenantId).eq("person_id", personId).limit(1)
  ]);
  if (person.error || suppression.error || reply.error) throw new Error("Contrôle VSC indisponible");
  if (!person.data || person.data.primary_email?.trim().toLowerCase() !== email.trim().toLowerCase()) return { stopped: true };
  return { stopped: person.data.contact_allowed !== true || !!person.data.do_not_contact || !!suppression.data?.length || !!reply.data?.length };
}
