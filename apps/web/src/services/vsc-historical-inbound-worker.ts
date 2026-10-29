/** Conservative VSC inbound holds; never claims exact historical thread attribution. */
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { assertVscBrevoImportEnvironment } from './vsc-brevo-contact-import';
import { auditVscHistoricalReplies } from './vsc-historical-reply-audit';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function reconcileVscHistoricalInboundOnce(tenant:string,actor:string){
 if(!UUID.test(tenant)||tenant!==process.env.VSC_OVH_TENANT_ID?.trim()||!UUID.test(actor))throw new Error('Entreprise ou administrateur non autorisé');
 assertVscBrevoImportEnvironment();
 const db=createSupabaseServiceRoleClient();
 const init=await db.from('vsc_historical_imap_cursors').upsert({tenant_id:tenant},{onConflict:'tenant_id',ignoreDuplicates:true});
 if(init.error)throw new Error('Point de reprise indisponible');
 const previous=await db.from('vsc_historical_imap_cursors').select('uid_validity,last_uid,version').eq('tenant_id',tenant).single();
 if(previous.error||!previous.data)throw new Error('Point de reprise indisponible');
 const row=previous.data;
 const audit=await auditVscHistoricalReplies(tenant,{uidValidity:row.uid_validity,lastUid:Number(row.last_uid)});
 if(audit.invalid||audit.ambiguous)throw new Error('Messages incomplets ou expéditeurs ambigus : examen nécessaire, point de reprise conservé');
 const messages=audit.candidates.map(c=>({personId:c.personId,from:c.from,messageId:c.messageId,receivedAt:c.receivedAt}));
 const {data,error}=await db.rpc('vsc_apply_historical_inbound_batch',{p_tenant_id:tenant,p_actor_id:actor,p_version:row.version,p_uid_validity:audit.cursor.uidValidity,p_last_uid:audit.cursor.lastUid,p_messages:messages});
 if(error||!data||!Number.isSafeInteger(data.held)||data.held<0||!Number.isSafeInteger(data.cancelled)||data.cancelled<0||data.version!==row.version+1)throw new Error('Lot interrompu ou concurrent : relire le point de reprise');
 return {inspected:audit.scanned,held:data.held as number,cancelled:data.cancelled as number,automated:audit.automated,hasMore:audit.hasMore,checkedAt:audit.checkedAt,sendingEnabled:false as const,exactThreadVerified:false as const};
}
