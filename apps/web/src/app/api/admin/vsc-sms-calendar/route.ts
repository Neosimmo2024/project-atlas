import {NextResponse} from 'next/server';
import {getTenantContext} from '@/repositories/tenant-context';
import {canManageOvh} from '@/services/ovh-connection';
import {previewVscSmsCalendar} from '@/services/vsc-sms-calendar';
export const runtime='nodejs';export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};
export async function GET(request:Request){try{
 const tenant=process.env.VSC_OVH_TENANT_ID?.trim();const ctx=tenant?await getTenantContext(tenant):null;
 if(!ctx||!canManageOvh(ctx))return NextResponse.json({error:'Accès refusé'},{status:403,headers});
 const date=new URL(request.url).searchParams.get('startDate')??undefined;
 return NextResponse.json(await previewVscSmsCalendar(ctx.tenantId,date),{headers});
}catch{return NextResponse.json({error:'Calendrier indisponible. Vérifiez la date et rechargez les contrôles.'},{status:503,headers});}}
