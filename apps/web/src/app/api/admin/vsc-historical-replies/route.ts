import {NextResponse} from 'next/server';
import {getTenantContext} from '@/repositories/tenant-context';
import {canManageOvh} from '@/services/ovh-connection';
import {auditVscHistoricalReplies} from '@/services/vsc-historical-reply-audit';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=90;
export async function POST(request:Request){const headers={'Cache-Control':'no-store'};
 if(request.headers.get('origin')!==new URL(request.url).origin)return NextResponse.json({error:'Origine refusée'},{status:403,headers});
 try{const tenant=process.env.VSC_OVH_TENANT_ID?.trim();const ctx=tenant?await getTenantContext(tenant):null;if(!ctx||!canManageOvh(ctx))return NextResponse.json({error:'Accès refusé'},{status:403,headers});
  if(!request.headers.get('content-type')?.startsWith('application/json'))return NextResponse.json({error:'Format invalide'},{status:415,headers});
  const text=await request.text();if(text.length>1000)return NextResponse.json({error:'Requête trop grande'},{status:413,headers});let body;try{body=JSON.parse(text);}catch{return NextResponse.json({error:'Requête invalide'},{status:400,headers});}
  return NextResponse.json(await auditVscHistoricalReplies(ctx.tenantId,body?.cursor),{headers});
 }catch{return NextResponse.json({error:'Inspection historique interrompue. Le point de reprise habituel est conservé. Aucune relance ni aucun envoi effectué.'},{status:503,headers});}}
