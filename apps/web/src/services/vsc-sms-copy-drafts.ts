/** Immutable SMS review copies, never campaign delivery records. */
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { previewVscSms, VSC_SMS_STEPS, type VscSmsMessage } from "@/features/vsc-campaign/sms-content";
import { vscDraftToday } from "@/services/vsc-draft-workspace";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class VscSmsCopyInputError extends Error {}
export type VscSmsCopy = { id: string; name: string; startDate: string; hasEmail: boolean; messages: VscSmsMessage[] };
const columns = "id,name,start_date,has_email,messages,created_at";
function tenant(tenantId: string) {
  if (!UUID.test(tenantId) || tenantId !== process.env.VSC_OVH_TENANT_ID?.trim()) throw new Error("Entreprise non autorisée");
}
function canonicalMessages(messages: VscSmsMessage[]) {
  return VSC_SMS_STEPS.map(stepKey => ({ stepKey, text: messages.find(message => message.stepKey === stepKey)!.text.trim() }));
}
export async function saveVscSmsCopy(tenantId: string, value: unknown) {
  tenant(tenantId);
  const input = value as VscSmsCopy | null;
  if (!input || !UUID.test(input.id) || typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 150 || typeof input.hasEmail !== "boolean")
    throw new VscSmsCopyInputError("Nom, identifiant et parcours du brouillon SMS invalides.");
  try { previewVscSms({ ...input, today: vscDraftToday() }); }
  catch (error) { throw new VscSmsCopyInputError(error instanceof Error ? error.message : "Brouillon SMS invalide"); }
  const messages = canonicalMessages(input.messages);
  const row = { tenant_id: tenantId, id: input.id, name: input.name.trim(), start_date: input.startDate, has_email: input.hasEmail, messages };
  const db = createSupabaseServiceRoleClient();
  const written = await db.from("vsc_sms_copy_drafts").upsert(row, { onConflict: "tenant_id,id", ignoreDuplicates: true });
  if (written.error) throw new Error("Sauvegarde SMS indisponible");
  const saved = await db.from("vsc_sms_copy_drafts").select(columns).eq("tenant_id", tenantId).eq("id", input.id).single();
  if (saved.error || !saved.data) throw new Error("Confirmation de sauvegarde SMS indisponible");
  const stored = saved.data;
  if (stored.name !== row.name || stored.start_date !== row.start_date || stored.has_email !== row.has_email || JSON.stringify(canonicalMessages(stored.messages)) !== JSON.stringify(messages))
    throw new VscSmsCopyInputError("Cette version existe avec un autre contenu. Préparez une nouvelle version.");
  return { id: stored.id };
}
export async function listVscSmsCopies(tenantId: string) {
  tenant(tenantId);
  const { data, error } = await createSupabaseServiceRoleClient().from("vsc_sms_copy_drafts").select(columns)
    .eq("tenant_id", tenantId).order("created_at", { ascending: false }).order("id", { ascending: true }).limit(21);
  if (error) throw new Error("Lecture des brouillons SMS indisponible");
  return { drafts: (data ?? []).slice(0, 20).map(row => ({ id: row.id, name: row.name, startDate: row.start_date, hasEmail: row.has_email, messages: row.messages as VscSmsMessage[], createdAt: row.created_at })), truncated: (data ?? []).length > 20 };
}
