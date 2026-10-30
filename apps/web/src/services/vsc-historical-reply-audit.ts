/** Inbox metadata audit only. Compatible subjects are candidates, never verified replies. */
import {createSupabaseServiceRoleClient} from '@/lib/supabase/service-role';
import {assertVscBrevoImportEnvironment} from './vsc-brevo-contact-import';
import {inspectVscHistoricalInbox} from './vsc-ovh-imap';
export type VscHistoryCursor={uidValidity:string|null;lastUid:number};
export function validateVscHistoryCursor(value:unknown):VscHistoryCursor {
  if(value===undefined||value===null)return {uidValidity:null,lastUid:0};
  const c=value as Partial<VscHistoryCursor>;
  if(typeof c.lastUid!=='number'||!Number.isSafeInteger(c.lastUid)||c.lastUid<0||c.lastUid>4294967295||!(c.uidValidity===null||typeof c.uidValidity==='string'&&/^[1-9]\d*$/.test(c.uidValidity))||c.lastUid>0&&c.uidValidity===null)throw new Error('État historique invalide');
  return {uidValidity:c.uidValidity!,lastUid:c.lastUid};
}
export function isVscHistoricalSubject(subject:string){return subject.trim().replace(/^(?:(?:re|rép|aw|sv)(?:\[\d+\])?\s*:\s*)+/i,'').replace(/\s+/g,' ').toLowerCase()==='un projet pour votre commerce, aujourd’hui ou demain ?';}
export async function auditVscHistoricalReplies(tenant:string,rawCursor?:unknown){
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenant)||tenant!==process.env.VSC_OVH_TENANT_ID?.trim())throw new Error('Entreprise non autorisée');
  assertVscBrevoImportEnvironment();const cursor=validateVscHistoryCursor(rawCursor);
  const db=createSupabaseServiceRoleClient();
  const data: {person_id:string|null;source_email:string|null;history_campaign_2:{sentAt?:string}|null}[]=[];
  for(let offset=0;offset<=5000;offset+=1000){
    const page=await db.from('vsc_brevo_contact_links').select('person_id,source_email,history_campaign_2').eq('tenant_id',tenant).not('source_email','is',null).order('provider_id').range(offset,offset+999);
    if(page.error||!page.data)throw new Error('Historique VSC indisponible');data.push(...page.data);
    if(data.length>5000)throw new Error('Historique trop volumineux');if(page.data.length<1000)break;
  }
  const known=new Map<string,{personId:string;sentAt:number}[]>();
  for(const row of data){const date=Date.parse(row.history_campaign_2?.sentAt??'');if(row.source_email&&row.person_id&&Number.isFinite(date)){const people=known.get(row.source_email)??[];if(!people.some(p=>p.personId===row.person_id))people.push({personId:row.person_id,sentAt:date});known.set(row.source_email,people);}}
  const inbox=await inspectVscHistoricalInbox(cursor);
  let ambiguous=0,automated=0;
  const candidates: {personId:string;from:string;subject:string;receivedAt:string;messageId:string;compatibleSubject:boolean;hasThread:boolean}[]=[];
  for(const message of inbox.envelopes){const people=known.get(message.from);if(!people?.length)continue;if(people.length!==1){ambiguous++;continue;}if(Date.parse(message.receivedAt)<people[0].sentAt)continue;if(message.automated){automated++;continue;}
    candidates.push({personId:people[0].personId,from:message.from,subject:message.subject,receivedAt:message.receivedAt,messageId:message.messageId,compatibleSubject:isVscHistoricalSubject(message.subject),hasThread:message.hasThread});}
  return {scanned:inbox.scanned,invalid:inbox.invalid,hasMore:inbox.hasMore,cursor:inbox.cursor,since:inbox.since,checkedAt:inbox.checkedAt,knownSenders:known.size,automated,ambiguous,candidates,readOnly:true as const};
}
