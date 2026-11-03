import {NextResponse} from 'next/server';
import {getTenantContext} from '@/repositories/tenant-context';
import {canManageOvh} from '@/services/ovh-connection';
import {sendVscPersonalTest} from '@/services/vsc-personal-test-send';
export const runtime='nodejs';export const maxDuration=60;
export async function POST(request:Request){
 const headers={'Cache-Control':'no-store'};
 if(request.headers.get('origin')!==new URL(request.url).origin)return NextResponse.json({error:'Origine refusée'},{status:403,headers});
 try{
  const tenant=process.env.VSC_OVH_TENANT_ID?.trim();const context=tenant?await getTenantContext(tenant):null;
  if(!context||!canManageOvh(context))return NextResponse.json({error:'Accès refusé'},{status:403,headers});
  if(Number(request.headers.get('content-length'))>512)return NextResponse.json({error:'Requête invalide'},{status:400,headers});
  const raw=await request.text();if(raw.length>512)return NextResponse.json({error:'Requête invalide'},{status:400,headers});
  const body=JSON.parse(raw);
  if(!body||Object.keys(body).length!==2||body.confirmed!==true||!['email','sms'].includes(body.channel))return NextResponse.json({error:'Confirmation du test requise'},{status:400,headers});
  return NextResponse.json(await sendVscPersonalTest(context,body.channel),{headers});
 }catch{return NextResponse.json({error:'Test interrompu. Vérifiez le résultat enregistré avant toute autre action ; aucun renvoi automatique.'},{status:503,headers});}
}
