import {NextResponse} from 'next/server';
import {getTenantContext} from '@/repositories/tenant-context';
import {canManageOvh} from '@/services/ovh-connection';
import {reconcileVscHistoricalInboundOnce} from '@/services/vsc-historical-inbound-worker';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=120;
export async function POST(request:Request){const headers={'Cache-Control':'no-store'};
 if(request.headers.get('origin')!==new URL(request.url).origin)return NextResponse.json({error:'Origine refusée'},{status:403,headers});
 try{const tenant=process.env.VSC_OVH_TENANT_ID?.trim();const ctx=tenant?await getTenantContext(tenant):null;
 if(!ctx||!canManageOvh(ctx))return NextResponse.json({error:'Accès refusé'},{status:403,headers});
 return NextResponse.json(await reconcileVscHistoricalInboundOnce(ctx.tenantId,ctx.userId),{headers});
 }catch{return NextResponse.json({error:'Traitement historique interrompu. Relisez le bilan avant de reprendre. Aucun envoi effectué.'},{status:503,headers});}}
