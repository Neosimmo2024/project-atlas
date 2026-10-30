/** Read Brevo's SMS block flags; preserve restrictions in Atlas VSC only. Never sends. */
import {createSupabaseServiceRoleClient} from '@/lib/supabase/service-role';
import {assertVscBrevoImportEnvironment} from './vsc-brevo-contact-import';
import {inspectVscBrevoSmsAccount} from './vsc-brevo-sms-status';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function syncVscBrevoSmsStops(tenant:string,actor:string){
 if(!UUID.test(tenant)||tenant!==process.env.VSC_OVH_TENANT_ID?.trim()||!UUID.test(actor))throw new Error('Entreprise ou administrateur non autorisé');
 assertVscBrevoImportEnvironment();
 if((await inspectVscBrevoSmsAccount(tenant)).state!=='identity_verified')throw new Error('Compte VSC dédié non vérifié');
 const key=process.env.BREVO_VSC_API_KEY?.trim();if(!key)throw new Error('Clé VSC absente');
 const deadline=Date.now()+45000,ids=new Set<number>(),blocked:number[]=[];let count:number|null=null,offset=0,unknown=0;
 for(let page=0;page<10;page++){
  const remaining=deadline-Date.now();if(remaining<=0)throw new Error('Lecture interrompue');
  const response=await fetch(`https://api.brevo.com/v3/contacts?limit=1000&offset=${offset}&sort=asc`,{method:'GET',headers:{'api-key':key,accept:'application/json'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(Math.min(8000,remaining))});
  if(!response.ok)throw new Error('Lecture des STOP indisponible');const result=await response.json();
  if(!Array.isArray(result?.contacts)||result.contacts.length>1000||!Number.isSafeInteger(result.count)||result.count<0||result.count>5000||count!==null&&count!==result.count)throw new Error('Instantané STOP incomplet');count=result.count;
  for(const row of result.contacts){if(!Number.isSafeInteger(row?.id)||row.id<=0||ids.has(row.id))throw new Error('Identités Brevo incohérentes');ids.add(row.id);if(row.smsBlacklisted===true)blocked.push(row.id);else if(row.smsBlacklisted!==false)unknown++;}
  offset+=result.contacts.length;if(offset===count)break;if(offset>(count??0)||!result.contacts.length||page===9)throw new Error('Pagination STOP incomplète');
 }
 if(count!==ids.size)throw new Error('Lecture STOP incomplète');
 // No write occurs until every source page has been validated. No provider updates or retries.
 const {data,error}=await createSupabaseServiceRoleClient().rpc('vsc_apply_brevo_sms_stops',{p_tenant_id:tenant,p_actor_id:actor,p_source_ids:blocked});
 if(error||!data||['matchedSources','unmappedSources','peopleStopped','cancelled'].some(k=>!Number.isSafeInteger(data[k])||data[k]<0))throw new Error('Synchronisation interrompue ; relisez le bilan avant de reprendre');
 return {sourceContacts:ids.size,sourceSmsBlocked:blocked.length,unknownSmsStatus:unknown,matchedSources:data.matchedSources as number,unmappedSources:data.unmappedSources as number,peopleStopped:data.peopleStopped as number,cancelled:data.cancelled as number,checkedAt:new Date().toISOString(),sendingEnabled:false as const};
}
