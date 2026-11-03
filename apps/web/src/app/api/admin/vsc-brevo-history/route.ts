import {NextResponse} from 'next/server';
import {getTenantContext} from '@/repositories/tenant-context';
import {canManageOvh} from '@/services/ovh-connection';
import {getVscBrevoHistoryStatus,reconcileVscBrevoHistoryBatch} from '@/services/vsc-brevo-history';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=120;
const headers={'Cache-Control':'no-store'};
async function actor(){const tenant=process.env.VSC_OVH_TENANT_ID?.trim();const ctx=tenant?await getTenantContext(tenant):null;return ctx&&canManageOvh(ctx)?ctx:null;}
export async function GET(){try{const ctx=await actor();if(!ctx)return NextResponse.json({error:'Accès refusé'},{status:403,headers});return NextResponse.json(await getVscBrevoHistoryStatus(ctx.tenantId),{headers});}catch{return NextResponse.json({error:'Historique indisponible'},{status:503,headers});}}
export async function POST(request:Request){if(request.headers.get('origin')!==new URL(request.url).origin)return NextResponse.json({error:'Origine refusée'},{status:403,headers});try{const ctx=await actor();if(!ctx)return NextResponse.json({error:'Accès refusé'},{status:403,headers});return NextResponse.json(await reconcileVscBrevoHistoryBatch(ctx.tenantId,ctx.userId),{headers});}catch{return NextResponse.json({error:'Lot interrompu. Aucun envoi lancé. Rechargez le bilan avant de reprendre ; les lots déjà enregistrés sont conservés.'},{status:503,headers});}}
