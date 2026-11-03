import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import type { VscImapCursor, VscImapBatch } from "@/features/vsc-campaign/imap-cursor";

function assertTenant(tenantId: string) {
  if (!tenantId || tenantId !== process.env.VSC_OVH_TENANT_ID?.trim()) throw new Error("Entreprise OVH non autorisée");
}
export async function loadVscImapCursor(tenantId: string): Promise<VscImapCursor> {
  assertTenant(tenantId);
  const db = createSupabaseServiceRoleClient();
  const { error: initError } = await db.from("vsc_imap_cursors").upsert({ tenant_id: tenantId }, { onConflict: "tenant_id", ignoreDuplicates: true });
  if (initError) throw initError;
  const { data, error } = await db.from("vsc_imap_cursors").select("uid_validity,last_uid,version").eq("tenant_id", tenantId).single();
  if (error) throw error;
  return { uidValidity: data.uid_validity, lastUid: Number(data.last_uid), version: data.version };
}

/** Compare-and-swap prevents a concurrent run from moving a newer checkpoint backwards. */
export async function saveVscImapCursor(tenantId: string, previous: VscImapCursor, batch: VscImapBatch): Promise<void> {
  assertTenant(tenantId);
  const db = createSupabaseServiceRoleClient();
  const { data, error } = await db.from("vsc_imap_cursors").update({
    uid_validity: batch.uidValidity, last_uid: batch.lastUid, version: previous.version + 1,
    updated_at: new Date().toISOString()
  }).eq("tenant_id", tenantId).eq("version", previous.version).select("tenant_id").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Synchronisation OVH concurrente : reprendre au dernier point enregistré");
}
