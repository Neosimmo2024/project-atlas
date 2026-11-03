import {NextResponse} from 'next/server';
import {getTenantContext} from '@/repositories/tenant-context';
import {canManageOvh} from '@/services/ovh-connection';
import {getVscCollectionStatus} from '@/services/vsc-collection-status';
export const runtime='nodejs';export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};
export async function GET(){try{const tenant=process.env.VSC_OVH_TENANT_ID?.trim();const ctx=tenant?await getTenantContext(tenant):null;if(!ctx||!canManageOvh(ctx))return NextResponse.json({error:'Accès refusé'},{status:403,headers});return NextResponse.json(await getVscCollectionStatus(ctx.tenantId),{headers});}catch{return NextResponse.json({error:'Suivi de collecte indisponible'},{status:503,headers});}}
