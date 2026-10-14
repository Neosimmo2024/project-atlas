import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
export async function BrevoCoverage({ tenantId }: { tenantId: string }) {
  const db = createSupabaseServiceRoleClient();
  const query = () => db.from("timeline_events").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId)
    .contains("metadata", { source: "brevo_outbound_journal" });
  const results = await Promise.allSettled([query(), query().ilike("metadata->>recipient_email", "%@lmdimmobilier.fr"),
    query().contains("metadata", { channel: "brevo_marketing" }),
    db.rpc("get_vault_secret_value", { p_name: `atlas_brevo_history_summary_${tenantId}` })]);
  const counts = results.slice(0, 3).map(result => result.status === "fulfilled" && !result.value.error && "count" in result.value ? result.value.count ?? 0 : null);
  let summary: { unmatched_smtp_events?: number; marketing_pending?: boolean } | null = null;
  const state = results[3];
  if (state.status === "fulfilled" && !state.value.error && state.value.data) {
    try { summary = JSON.parse(String(state.value.data)); } catch { /* Do not display corrupt state. */ }
  }
  return <section className="card stack"><h2>Envois Brevo suivis</h2>
    <p>{counts[0] ?? "—"} message(s) rattaché(s) aux fiches, dont {counts[1] ?? "—"} LMD et {counts[2] ?? "—"} envoi(s) de campagnes Brevo.</p>
    <p>Les réponses sont rapprochées des identifiants d’envoi. Pour les campagnes sans identifiant disponible, le rapprochement par destinataire et objet vous est présenté à confirmer.</p>
    {summary?.marketing_pending && <p>L’analyse des destinataires des campagnes est en cours.</p>}
    {!!summary?.unmatched_smtp_events && <p>{summary.unmatched_smtp_events} trace(s) d’envoi sans fiche unique correspondante : elles ne sont pas rattachées automatiquement.</p>}
  </section>;
}
