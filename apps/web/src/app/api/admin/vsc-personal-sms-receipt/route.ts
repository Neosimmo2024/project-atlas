import {NextResponse} from 'next/server';
import {getTenantContext} from '@/repositories/tenant-context';
import {canManageOvh} from '@/services/ovh-connection';
import {inspectVscPersonalSmsReceipt} from '@/services/vsc-personal-sms-receipt';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=60;
export async function GET(){const headers={'Cache-Control':'no-store'};try{const tenant=process.env.VSC_OVH_TENANT_ID?.trim();const context=tenant?await getTenantContext(tenant):null;if(!context||!canManageOvh(context))return NextResponse.json({error:'Accès refusé'},{status:403,headers});return NextResponse.json(await inspectVscPersonalSmsReceipt(context),{headers});}catch{return NextResponse.json({error:'Suivi SMS indisponible. Aucun nouveau message envoyé.'},{status:503,headers});}}
