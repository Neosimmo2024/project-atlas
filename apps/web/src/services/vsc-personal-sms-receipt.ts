/** Read the existing test's provider events. Never submits or retries an SMS. */
import type {TenantContext} from '@/types/domain';
import {createSupabaseServiceRoleClient} from '@/lib/supabase/service-role';
import {canManageOvh} from './ovh-connection';
import {assertVscBrevoImportEnvironment} from './vsc-brevo-contact-import';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function inspectVscPersonalSmsReceipt(context:TenantContext){
 assertVscBrevoImportEnvironment();if(!canManageOvh(context))throw new Error('Accès refusé');
 const {data,error}=await createSupabaseServiceRoleClient().rpc('vsc_personal_sms_receipt',{p_tenant_id:context.tenantId,p_actor_id:context.userId});
 if(error||!data)throw new Error('Reçu indisponible');
 if(data.state!=='accepted')return {readOnly:true as const,submissionState:String(data.state),delivery:'not_confirmed' as const,events:[]};
 if(!UUID.test(data.id)||!/^\+33[67][0-9]{8}$/.test(data.mobile)||!/^\d{1,20}$/.test(data.reference)||!Number.isFinite(Date.parse(data.startedAt)))throw new Error('Reçu incohérent');
 const key=process.env.BREVO_VSC_API_KEY?.trim();if(!key)throw new Error('Compte dédié non vérifié');
 const accountResponse=await fetch('https://api.brevo.com/v3/account',{method:'GET',headers:{'api-key':key,accept:'application/json'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!accountResponse.ok)throw new Error('Compte dédié indisponible');const account=await accountResponse.json();
 if(typeof account?.email!=='string'||account.email.trim().toLowerCase()!=='contact@vendresoncommerce.com')throw new Error('Compte dédié non vérifié');
 const plans=Array.isArray(account.plan)?account.plan.filter((p:{type?:string})=>p?.type==='sms'):[];
 const credits=plans.length===1?plans[0].credits:undefined;
 const creditState=typeof credits==='number'&&Number.isFinite(credits)&&credits>=0?(credits===0?'none':'available'):'unknown';
 const tag=`vsc-test-${data.id}`;
 const query=new URLSearchParams({limit:'100',startDate:new Date(Date.parse(data.startedAt)-86400000).toISOString().slice(0,10),endDate:new Date().toISOString().slice(0,10),phoneNumber:data.mobile.slice(1),sort:'desc'});
 const response=await fetch(`https://api.brevo.com/v3/transactionalSMS/statistics/events?${query}`,{method:'GET',headers:{'api-key':key,accept:'application/json'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error('Rapport indisponible');const body=await response.json();
 if(!Array.isArray(body?.events)||body.events.length>=100)throw new Error('Rapport incomplet');
 const events:Array<{type:string;date:string;reason:string|null}>=[];
 for(const event of body.events){
  if(String(event?.messageId)!==data.reference)continue;
  if(String(event.phoneNumber).replace(/^\+/, '')!==data.mobile.slice(1)||(event.tag!=null&&event.tag!==tag)||typeof event.event!=='string'||!Number.isFinite(Date.parse(event.date)))throw new Error('Événement incohérent');
  const type=event.event.toLowerCase().replace(/[_-]/g,'');
  if(!['sent','request','requests','accepted','delivered','softbounce','softbounces','hardbounce','hardbounces','blocked','rejected','skipped','unsubscribed','replied','reply'].includes(type))throw new Error('Événement inconnu');
  const reason=['softbounce','softbounces','hardbounce','hardbounces','blocked','rejected','skipped'].includes(type)&&typeof event.reason==='string'&&/^[a-zA-Z _-]{1,100}$/.test(event.reason)?event.reason:null;
  events.push({type,date:new Date(event.date).toISOString(),reason});
 }
 const failure=events.some(e=>['softbounce','softbounces','hardbounce','hardbounces','blocked','rejected','skipped'].includes(e.type));
 const delivered=events.some(e=>e.type==='delivered');
 return {readOnly:true as const,submissionState:'accepted',creditState,sourceEvents:body.events.length,matchedEvents:events.length,delivery:failure?(delivered?'conflicting':'provider_failed'):delivered?'provider_delivered':'not_confirmed',events};
}
