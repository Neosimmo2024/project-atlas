import type { SupabaseClient } from "@supabase/supabase-js";
export async function lfiOtherCampaignExclusions(db:SupabaseClient,tenantId:string,personIds:string[]){
 if(!personIds.length)return new Set<string>();
 const cutoff=new Date(Date.now()-15*86400000).toISOString();
 const [sequences,events]=await Promise.all([
  db.from("recruitment_email_sequences").select("person_id").eq("tenant_id",tenantId).in("person_id",personIds).or(`lifecycle_status.in.(scheduled,running,stopped,error),sent_at.gte.${cutoff}`),
  db.from("timeline_events").select("person_id").eq("tenant_id",tenantId).in("person_id",personIds).eq("event_type","recruitment_email_sent").gte("occurred_at",cutoff)
 ]);
 if(sequences.error || events.error)throw new Error("Vérification des autres campagnes indisponible.");
 return new Set<string>([...sequences.data,...events.data].map(r=>r.person_id).filter(Boolean));
}
