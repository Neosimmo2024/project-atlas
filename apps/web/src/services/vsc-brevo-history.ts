/** Historical Brevo read only; all future commercial emails remain OVH. */
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { inspectVscBrevoSmsAccount } from './vsc-brevo-sms-status';
import { assertVscBrevoImportEnvironment } from './vsc-brevo-contact-import';
import { normalizeVscImportEmail } from '@/features/vsc-campaign/brevo-contact-import';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function authorize(tenant:string) { if (!UUID.test(tenant)||tenant!==process.env.VSC_OVH_TENANT_ID?.trim()) throw new Error('Entreprise non autorisée'); assertVscBrevoImportEnvironment(); }
export function normalizeVscHistoricalStats(stats:unknown) {
  if (!stats || typeof stats!=='object' || Array.isArray(stats)) throw new Error('Statistiques absentes');
  const source=stats as Record<string,unknown>;
  function events(key:string) {
    if (source[key]===undefined) return [] as string[];
    if (!Array.isArray(source[key])) throw new Error('Statistiques incohérentes');
    return (source[key] as {campaignId?:unknown;eventTime?:unknown}[]).flatMap(row=>{
      if (!row||row.campaignId!==2) return [];
      if(typeof row.eventTime!=='string'||!Number.isFinite(Date.parse(row.eventTime))||Date.parse(row.eventTime)<Date.parse('2026-10-26T00:00:00Z')||Date.parse(row.eventTime)>Date.now()+300000) throw new Error('Date historique invalide');
      return [new Date(row.eventTime).toISOString()];
    }).sort();
  }
  const sent=events('messagesSent');
  return {sentAt:sent[0]??null,delivered:events('delivered').length>0,hardBounce:events('hardBounces').length>0,softBounce:events('softBounces').length>0};
}
export async function getVscBrevoHistoryStatus(tenant:string) {
  authorize(tenant);
  const {data,error}=await createSupabaseServiceRoleClient().from('vsc_brevo_contact_links').select('history_campaign_2,history_campaign_2_checked_at').eq('tenant_id',tenant).not('source_email','is',null).order('provider_id').limit(5001);
  if(error||!data||data.length>5000) throw new Error('Historique indisponible');
  const done=data.filter(r=>r.history_campaign_2_checked_at);
  return {total:data.length,checked:done.length,remaining:data.length-done.length,sent:done.filter(r=>r.history_campaign_2?.sentAt).length,delivered:done.filter(r=>r.history_campaign_2?.delivered).length,hardBounces:done.filter(r=>r.history_campaign_2?.hardBounce).length,softBounces:done.filter(r=>r.history_campaign_2?.softBounce).length,notObserved:done.filter(r=>!r.history_campaign_2?.sentAt).length,sendingEnabled:false as const};
}
export async function reconcileVscBrevoHistoryBatch(tenant:string,actor:string) {
  authorize(tenant); if(!UUID.test(actor)) throw new Error('Administrateur invalide');
  if((await inspectVscBrevoSmsAccount(tenant)).state!=='identity_verified') throw new Error('Compte dédié non vérifié');
  const key=process.env.BREVO_VSC_API_KEY?.trim();if(!key)throw new Error('Clé VSC absente');
  const deadline=Date.now()+45000;
  async function read(path:string) {
    const remaining=deadline-Date.now();if(remaining<=0)throw new Error('Lecture interrompue');
    const response=await fetch('https://api.brevo.com/v3/'+path,{method:'GET',headers:{'api-key':key!,accept:'application/json'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(Math.min(8000,remaining))});
    if(!response.ok)throw new Error('Lecture Brevo indisponible');return await response.json();
  }
  const campaign=await read('emailCampaigns/2?statistics=globalStats&excludeHtmlContent=true');
  if(campaign?.id!==2||campaign.status!=='sent'||typeof campaign.name!=='string'||!campaign.name.startsWith('VSC')||campaign.sender?.email?.trim().toLowerCase()!=='contact@vendresoncommerce.com'||typeof campaign.sentDate!=='string'||!campaign.sentDate.startsWith('2026-10-26')||!Number.isFinite(Date.parse(campaign.sentDate))||!Array.isArray(campaign.recipients?.lists)||campaign.recipients.lists.length!==1||campaign.recipients.lists[0]!==4) throw new Error('Campagne historique non reconnue');
  const db=createSupabaseServiceRoleClient();
  const {data:links,error}=await db.from('vsc_brevo_contact_links').select('provider_id,person_id,source_email').eq('tenant_id',tenant).not('source_email','is',null).is('history_campaign_2_checked_at',null).order('provider_id').limit(25);
  if(error||!links)throw new Error('Source Atlas indisponible');
  const entries=[];
  for(let offset=0;offset<links.length;offset+=3){
    const batch=await Promise.all(links.slice(offset,offset+3).map(async link=>{
      if(!Number.isSafeInteger(link.provider_id)||link.provider_id<=0||!link.person_id)throw new Error('Identité source invalide');
      const contact=await read(`contacts/${link.provider_id}?identifierType=contact_id&startDate=2026-10-26&endDate=${new Date().toISOString().slice(0,10)}`);
      if(contact?.id!==link.provider_id||normalizeVscImportEmail(contact.email)!==link.source_email||typeof contact.emailBlacklisted!=='boolean')throw new Error('Identité ou statut modifié');
      return {provider_id:link.provider_id,person_id:link.person_id,email:link.source_email,emailBlocked:contact.emailBlacklisted,...normalizeVscHistoricalStats(contact.statistics)};
    })); entries.push(...batch);
  }
  if(entries.length){const {error:writeError}=await db.rpc('vsc_record_brevo_history',{p_tenant_id:tenant,p_actor_id:actor,p_entries:entries});if(writeError)throw new Error('Rapprochement interrompu');}
  return {processed:entries.length,...await getVscBrevoHistoryStatus(tenant)};
}
