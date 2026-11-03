import {NextResponse} from 'next/server';
import {getTenantContext} from '@/repositories/tenant-context';
import {canManageOvh} from '@/services/ovh-connection';
import {prepareVscTechnicalPilot} from '@/services/vsc-technical-pilot';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=60;
export async function GET(){
 const headers={'Cache-Control':'no-store'};
 try{const tenant=process.env.VSC_OVH_TENANT_ID?.trim();const context=tenant?await getTenantContext(tenant):null;
 if(!context||!canManageOvh(context))return NextResponse.json({error:'Accès refusé'},{status:403,headers});
 return NextResponse.json(await prepareVscTechnicalPilot(context),{headers});
 }catch{return NextResponse.json({error:'Préparation du test indisponible. Aucun message envoyé.'},{status:503,headers});}
}
