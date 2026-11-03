import {createSupabaseServiceRoleClient} from '@/lib/supabase/service-role';
import {assertVscBrevoImportEnvironment} from './vsc-brevo-contact-import';
export type CollectionRun={requestedAt:string;finishedAt:string|null;state:'queued'|'running'|'complete'|'incomplete'|'failed'|'expired';summary:{repliesRecorded:number;historicalHeld:number;sourceContacts:number}|null};
export type CollectionStatus={enabled:boolean;scheduled:boolean;actorActive:boolean;signingConfigured:boolean;runs:CollectionRun[]};
export function collectionHealth(data:CollectionStatus,now=Date.now()):'disabled'|'needs_review'|'waiting'|'stale'|'queued'|'running'|'healthy'|'incomplete'{
 if(!data.enabled||!data.scheduled)return 'disabled';
 if(!data.actorActive||!data.signingConfigured)return 'needs_review';
 const last=data.runs[0];if(!last)return 'waiting';
 const age=now-Date.parse(last.requestedAt);
 if(!Number.isFinite(age)||age< -60000)return 'needs_review';
 if(age>20*60000)return 'stale';
 if(last.state==='queued')return age>5*60000?'needs_review':'queued';
 if(last.state==='running')return age>10*60000?'needs_review':'running';
 if(last.state==='failed'||last.state==='expired')return 'needs_review';
 if(!last.finishedAt||!Number.isFinite(Date.parse(last.finishedAt))||Date.parse(last.finishedAt)<Date.parse(last.requestedAt)||Date.parse(last.finishedAt)>now+60000)return 'needs_review';
 if(last.state==='complete'&&(!last.summary||['repliesRecorded','historicalHeld','sourceContacts'].some(k=>!Number.isSafeInteger(last.summary![k as keyof typeof last.summary])||last.summary![k as keyof typeof last.summary]<0)))return 'needs_review';
 return last.state==='complete'?'healthy':'incomplete';
}
export async function getVscCollectionStatus(tenant:string){
 assertVscBrevoImportEnvironment();if(tenant!==process.env.VSC_OVH_TENANT_ID?.trim())throw new Error('Entreprise non autorisée');
 const {data,error}=await createSupabaseServiceRoleClient().rpc('vsc_collection_status',{p_tenant_id:tenant});
 if(error||!data||['enabled','scheduled','actorActive','signingConfigured'].some(k=>typeof data[k]!=='boolean')||!Array.isArray(data.runs)||data.runs.length>10||data.runs.some((r:CollectionRun)=>!['queued','running','complete','incomplete','failed','expired'].includes(r.state)||!Number.isFinite(Date.parse(r.requestedAt))))throw new Error('Suivi de collecte indisponible');
 const status=data as CollectionStatus;return {...status,health:collectionHealth(status),checkedAt:new Date().toISOString(),sendingEnabled:false as const};
}
