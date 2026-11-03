/** Read-only launch review. No coordinates, approval, persistence or dispatch. */
import {createSupabaseServiceRoleClient} from '@/lib/supabase/service-role';
import {assertVscBrevoImportEnvironment} from './vsc-brevo-contact-import';
import {getVscCollectionStatus} from './vsc-collection-status';
import {previewVscSmsCalendar} from './vsc-sms-calendar';
import {vscDraftToday} from './vsc-draft-workspace';
import {isVscCalendarDate} from '@/features/vsc-campaign/policy';

type Delivery={campaign_id:string;person_id:string;channel:string;step_key:string;scheduled_at:string;status:string;provider_message_id:string|null;dispatch_started_at:string|null};
type Campaign={id:string;state:string;approved_at:string|null;enabled_at:string|null};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function parisDate(stamp:string){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(stamp));}
export async function getVscPilotReview(tenant:string){
  assertVscBrevoImportEnvironment();
  if(!UUID.test(tenant)||tenant!==process.env.VSC_OVH_TENANT_ID?.trim())throw new Error('Entreprise non autorisée');
  const today=vscDraftToday(),db=createSupabaseServiceRoleClient();
  const [collection,calendar,campaigns,deliveries,saved]=await Promise.all([
    getVscCollectionStatus(tenant),previewVscSmsCalendar(tenant),
    db.from('vsc_campaigns').select('id,state,approved_at,enabled_at').eq('tenant_id',tenant).order('id').limit(101),
    db.from('vsc_campaign_deliveries').select('campaign_id,person_id,channel,step_key,scheduled_at,status,provider_message_id,dispatch_started_at').eq('tenant_id',tenant).order('id').limit(1001),
    db.from('vsc_sms_plan_reviews').select('start_date,recipient_count,created_at').eq('tenant_id',tenant).order('created_at',{ascending:false}).order('id').limit(1)
  ]);
  if(campaigns.error||deliveries.error||saved.error||!Array.isArray(campaigns.data)||!Array.isArray(deliveries.data)||!Array.isArray(saved.data)||campaigns.data.length>100||deliveries.data.length>1000)throw new Error('Bilan incomplet ou indisponible');
  const campaignRows=campaigns.data as Campaign[],rows=deliveries.data as Delivery[];
  const campaignIds=new Set(campaignRows.map(c=>c.id));
  if(campaignRows.some(c=>!UUID.test(c.id)||!['draft','approved','active','paused','completed','cancelled'].includes(c.state))||rows.some(d=>!campaignIds.has(d.campaign_id)||!UUID.test(d.person_id)||!['email','sms'].includes(d.channel)||!Number.isFinite(Date.parse(d.scheduled_at))))throw new Error('Bilan incohérent');
  const groups=new Map<string,{step:string;scheduledAt:string;drafts:number;recipients:Set<string>;lots:Set<string>;untouched:boolean}>();
  for(const d of rows.filter(r=>r.channel==='email')){
    const key=`${d.step_key}|${d.scheduled_at}`;
    let group=groups.get(key);
    if(!group){group={step:d.step_key,scheduledAt:d.scheduled_at,drafts:0,recipients:new Set(),lots:new Set(),untouched:true};groups.set(key,group);}
    if(d.status==='draft')group.drafts++;
    group.recipients.add(d.person_id);group.lots.add(d.campaign_id);
    group.untouched&&=d.status==='draft'&&d.provider_message_id===null&&d.dispatch_started_at===null;
  }
  const latest=saved.data[0];
  if(latest&&(!isVscCalendarDate(latest.start_date)||!Number.isSafeInteger(latest.recipient_count)||latest.recipient_count<0||!Number.isFinite(Date.parse(latest.created_at))))throw new Error('Version sauvegardée incohérente');
  return {
    checkedAt:new Date().toISOString(),today,readOnly:true as const,sendingEnabled:false as const,
    collection:{health:collection.health,lastFinishedAt:collection.runs[0]?.finishedAt??null},
    campaigns:{total:campaignRows.length,approvedOrEnabled:campaignRows.filter(c=>c.state!=='draft'||c.approved_at!==null||c.enabled_at!==null).length},
    emailGroups:[...groups.values()].sort((a,b)=>a.scheduledAt.localeCompare(b.scheduledAt)).map(g=>({step:g.step,scheduledAt:g.scheduledAt,drafts:g.drafts,recipients:g.recipients.size,lots:g.lots.size,untouched:g.untouched,overdue:parisDate(g.scheduledAt)<today})),
    sms:{emailMobile:calendar.emailMobile,mobileOnly:calendar.mobileOnly,overdueReminders:calendar.overdueReminders,unknownHistory:calendar.unknownHistory,deliveries:rows.filter(r=>r.channel==='sms').length,
      savedPlan:latest?{startDate:latest.start_date,recipients:latest.recipient_count,overdue:latest.start_date<today}:null,
      proposal:{startDate:calendar.startDate,steps:calendar.mobileOnlySteps.map(s=>({date:s.date,promotional:s.promotional,providerDayAllowed:s.providerDayAllowed,segments:s.segments}))}},
    decisions:['test_recipients','sms_catchup','mobile_only_start','commercial_launch'] as const
  };
}
