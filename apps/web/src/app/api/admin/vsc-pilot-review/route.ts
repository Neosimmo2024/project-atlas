import {NextResponse} from 'next/server';
import {getTenantContext} from '@/repositories/tenant-context';
import {canManageOvh} from '@/services/ovh-connection';
import {getVscPilotReview} from '@/services/vsc-pilot-review';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};
export async function GET(){
  try{
    const tenant=process.env.VSC_OVH_TENANT_ID?.trim();
    const context=tenant?await getTenantContext(tenant):null;
    if(!context||!canManageOvh(context))return NextResponse.json({error:'Accès refusé'},{status:403,headers});
    return NextResponse.json(await getVscPilotReview(context.tenantId),{headers});
  }catch{return NextResponse.json({error:'Bilan du pilote indisponible. Rechargez les contrôles.'},{status:503,headers});}
}
