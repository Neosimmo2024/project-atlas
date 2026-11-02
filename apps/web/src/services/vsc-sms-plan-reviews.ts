/** Review snapshots only. Never creates campaigns, deliveries or provider requests. */
import {createHash, timingSafeEqual} from 'node:crypto';
import {createSupabaseServiceRoleClient} from '@/lib/supabase/service-role';
import {prepareVscSmsCalendar} from './vsc-sms-calendar';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function prepare(tenant:string,startDate?:string){
 const p=await prepareVscSmsCalendar(tenant,startDate);
 const reviewKey=createHash('sha256').update(JSON.stringify({version:1,tenant,...p})).digest('hex');
 return {...p,reviewKey};
}
export async function previewVscSmsPlanReview(tenant:string,startDate?:string){
 const p=await prepare(tenant,startDate);
 const {data,error}=await createSupabaseServiceRoleClient().from('vsc_sms_plan_reviews').select('id,start_date,recipient_count,created_at,calendar').eq('tenant_id',tenant).order('created_at',{ascending:false}).order('id').limit(11);
 if(error)throw new Error('Versions de relecture indisponibles');
 return {...p.calendar,reviewKey:p.reviewKey,saved:(data??[]).slice(0,10),limited:(data?.length??0)>10};
}
export async function saveVscSmsPlanReview(tenant:string,actor:string,startDate:unknown,key:unknown){
 if(!UUID.test(actor)||typeof startDate!=='string'||typeof key!=='string'||!/^[a-f0-9]{64}$/.test(key))throw new Error('Aperçu invalide');
 const p=await prepare(tenant,startDate);
 if(!timingSafeEqual(Buffer.from(key,'hex'),Buffer.from(p.reviewKey,'hex')))throw new Error('Calendrier ou sélection modifiés : rechargez la relecture');
 if(!p.contacts.length)throw new Error('Aucun mobile seul à préparer');
 const h=p.reviewKey,id=`${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
 const {data,error}=await createSupabaseServiceRoleClient().rpc('vsc_save_sms_plan_review',{p_tenant_id:tenant,p_actor_id:actor,p_id:id,p_start_date:startDate,p_contacts:p.contacts,p_calendar:p.calendar});
 if(error||!data||data.id!==id||data.recipients!==p.contacts.length)throw new Error('Sauvegarde non confirmée : rechargez avant une reprise explicite');
 return {...data,readOnly:true as const,sendingEnabled:false as const};
}
