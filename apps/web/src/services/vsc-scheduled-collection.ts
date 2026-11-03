/** Signed QA collection coordinator. No dispatch adapter is imported or called. */
import {createSupabaseServiceRoleClient} from '@/lib/supabase/service-role';
import {assertVscBrevoImportEnvironment} from './vsc-brevo-contact-import';
import {reconcileVscRepliesOnce} from './vsc-reply-worker';
import {reconcileVscHistoricalInboundOnce} from './vsc-historical-inbound-worker';
import {syncVscBrevoSmsStops} from './vsc-brevo-sms-stops';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type State='complete'|'incomplete'|'failed';
function counts(value:object,keys:string[]){const row=value as Record<string,unknown>;if(keys.some(k=>!Number.isSafeInteger(row[k])||Number(row[k])<0))throw new Error('Bilan incomplet');}
export async function runVscScheduledCollection(tenant:string,nonce:string,timestamp:string,signature:string){
 assertVscBrevoImportEnvironment();
 if(!UUID.test(tenant)||tenant!==process.env.VSC_OVH_TENANT_ID?.trim()||!UUID.test(nonce))throw new Error('Configuration de collecte invalide');
 const db=createSupabaseServiceRoleClient();
 const begin=await db.rpc('vsc_claim_collection',{p_tenant_id:tenant,p_nonce:nonce,p_timestamp:timestamp,p_signature:signature});
 if(begin.error)throw new Error('Réservation indisponible');
 if(['disabled','unauthorized','not_eligible'].includes(begin.data?.state))return {state:begin.data.state as 'disabled'|'unauthorized'|'not_eligible',sendingEnabled:false as const};
 if(begin.data?.state!=='claimed'||!UUID.test(begin.data.actor))throw new Error('Réservation incohérente');
 const actor:string=begin.data.actor;
 const summary={replies:'failed' as State,historical:'failed' as State,smsStops:'failed' as State,
  repliesInspected:0,repliesRecorded:0,historicalInspected:0,historicalHeld:0,historicalCancelled:0,
  sourceContacts:0,sourceSmsBlocked:0,unknownSmsStatus:0,unmappedSources:0,smsCancelled:0};
 try{const r=await reconcileVscRepliesOnce(tenant);counts(r,['inspected','matched','recorded']);if(typeof r.hasMore!=='boolean')throw new Error();summary.replies=r.hasMore?'incomplete':'complete';summary.repliesInspected=r.inspected;summary.repliesRecorded=r.recorded;}catch{/* Independent restrictions collectors still run. */}
 try{const r=await reconcileVscHistoricalInboundOnce(tenant,actor);counts(r,['inspected','held','cancelled','automated']);if(typeof r.hasMore!=='boolean'||r.sendingEnabled!==false)throw new Error();summary.historical=r.hasMore?'incomplete':'complete';summary.historicalInspected=r.inspected;summary.historicalHeld=r.held;summary.historicalCancelled=r.cancelled;}catch{/* No raw exception is stored. */}
 try{const r=await syncVscBrevoSmsStops(tenant,actor);counts(r,['sourceContacts','sourceSmsBlocked','unknownSmsStatus','unmappedSources','cancelled']);if(r.sendingEnabled!==false)throw new Error();summary.smsStops=r.unknownSmsStatus||r.unmappedSources?'incomplete':'complete';summary.sourceContacts=r.sourceContacts;summary.sourceSmsBlocked=r.sourceSmsBlocked;summary.unknownSmsStatus=r.unknownSmsStatus;summary.unmappedSources=r.unmappedSources;summary.smsCancelled=r.cancelled;}catch{/* No provider retry. */}
 const states=[summary.replies,summary.historical,summary.smsStops];
 const state:State=states.includes('failed')?'failed':states.includes('incomplete')?'incomplete':'complete';
 const finish=await db.rpc('vsc_finish_collection',{p_tenant_id:tenant,p_nonce:nonce,p_state:state,p_summary:summary});
 if(finish.error||finish.data!==true)throw new Error('Bilan non confirmé');
 return {state,summary,sendingEnabled:false as const};
}
