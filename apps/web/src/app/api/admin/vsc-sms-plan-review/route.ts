import {NextResponse} from 'next/server';
import {getTenantContext} from '@/repositories/tenant-context';
import {canManageOvh} from '@/services/ovh-connection';
import {previewVscSmsPlanReview,saveVscSmsPlanReview} from '@/services/vsc-sms-plan-reviews';
export const runtime='nodejs';export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};
async function actor(){const tenant=process.env.VSC_OVH_TENANT_ID?.trim();const ctx=tenant?await getTenantContext(tenant):null;return ctx&&canManageOvh(ctx)?ctx:null;}
export async function GET(request:Request){try{const ctx=await actor();if(!ctx)return NextResponse.json({error:'Accès refusé'},{status:403,headers});return NextResponse.json(await previewVscSmsPlanReview(ctx.tenantId,new URL(request.url).searchParams.get('startDate')??undefined),{headers});}catch{return NextResponse.json({error:'Relecture indisponible. Vérifiez la date et rechargez les contrôles.'},{status:503,headers});}}
export async function POST(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin)return NextResponse.json({error:'Origine refusée'},{status:403,headers});
 try{const ctx=await actor();if(!ctx)return NextResponse.json({error:'Accès refusé'},{status:403,headers});
 if(!request.headers.get('content-type')?.startsWith('application/json'))return NextResponse.json({error:'Format invalide'},{status:415,headers});
 const text=await request.text();if(text.length>1000)return NextResponse.json({error:'Requête trop grande'},{status:413,headers});
 let body;try{body=JSON.parse(text);}catch{return NextResponse.json({error:'Requête invalide'},{status:400,headers});}
 return NextResponse.json(await saveVscSmsPlanReview(ctx.tenantId,ctx.userId,body?.startDate,body?.reviewKey),{headers});
 }catch{return NextResponse.json({error:'Sauvegarde interrompue ou sélection modifiée. Rechargez la relecture. Aucun SMS lancé.'},{status:503,headers});}
}
