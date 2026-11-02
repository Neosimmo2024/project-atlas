import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { assertVscBrevoImportEnvironment } from './vsc-brevo-contact-import';
import { vscDraftToday } from './vsc-draft-workspace';
import { isVscCalendarDate } from '@/features/vsc-campaign/policy';
import { buildVscSmsCalendar } from '@/features/vsc-campaign/sms-calendar';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function parisDate(value: string) {
  const date = new Date(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !isVscCalendarDate(value.slice(0,10)) || !Number.isFinite(date.getTime())) throw new Error('Historique SMS incomplet');
  const parts=new Intl.DateTimeFormat('en',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const part=(type:string)=>parts.find(p=>p.type===type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export async function previewVscSmsCalendar(tenant:string,startDate?:string) {
  if(!UUID.test(tenant)||tenant!==process.env.VSC_OVH_TENANT_ID?.trim())throw new Error('Entreprise non autorisée');
  assertVscBrevoImportEnvironment();
  const today=vscDraftToday();
  // Validate dates before accessing contacts, even when no start date was supplied.
  buildVscSmsCalendar({today,startDate:startDate??today,historicalEmailDates:[],mobileOnly:0});
  const db=createSupabaseServiceRoleClient();
  const {data,error}=await db.rpc('vsc_sms_audience_contacts',{p_tenant_id:tenant});
  if(error||!Array.isArray(data)||data.length>=1000||data.some(c=>!UUID.test(c.id)||!/^\+33[67][0-9]{8}$/.test(c.mobile)||typeof c.has_email!=='boolean')||new Set(data.map(c=>c.mobile)).size!==data.length)
    throw new Error('Sélection SMS indisponible ou tronquée');
  const emailIds:string[]=data.filter(c=>c.has_email).map(c=>c.id);
  const sent=new Map<string,string>();
  for(let offset=0;offset<emailIds.length;offset+=100){
    const {data:history,error:failure}=await db.from('vsc_brevo_contact_links').select('person_id,history_campaign_2').eq('tenant_id',tenant).in('person_id',emailIds.slice(offset,offset+100)).order('provider_id').limit(1000);
    if(failure||!Array.isArray(history)||history.length>=1000)throw new Error('Historique SMS indisponible ou tronqué');
    for(const row of history){
      if(!emailIds.includes(row.person_id))throw new Error('Historique SMS hors sélection');
      const stamp=row.history_campaign_2?.sentAt;
      if(stamp==null)continue;
      if(typeof stamp!=='string')throw new Error('Historique SMS incomplet');
      const date=parisDate(stamp),previous=sent.get(row.person_id);
      if(!previous||date<previous)sent.set(row.person_id,date);
    }
  }
  return buildVscSmsCalendar({today,startDate:startDate??today,historicalEmailDates:emailIds.map(id=>sent.get(id)??null),mobileOnly:data.length-emailIds.length});
}
