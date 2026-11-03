import {NextResponse} from 'next/server';
import {runVscScheduledCollection} from '@/services/vsc-scheduled-collection';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=300;
const headers={'Cache-Control':'no-store'};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function GET(request:Request){
 const url=new URL(request.url);
 const timestamp=request.headers.get('x-vsc-timestamp')??'',nonce=request.headers.get('x-vsc-nonce')??'',signature=request.headers.get('x-vsc-signature')??'';
 if(url.pathname!=='/api/cron/vsc-collection'||url.search||!/^\d{10}$/.test(timestamp)||!UUID.test(nonce)||!/^[a-f0-9]{64}$/.test(signature)||Math.abs(Date.now()/1000-Number(timestamp))>300)
  return NextResponse.json({error:'Appel non autorisé'},{status:401,headers});
 const tenant=process.env.VSC_OVH_TENANT_ID?.trim();
 if(!tenant||!UUID.test(tenant))return NextResponse.json({error:'Configuration indisponible'},{status:503,headers});
 try{const result=await runVscScheduledCollection(tenant,nonce,timestamp,signature);const status=result.state==='complete'?200:result.state==='incomplete'?202:result.state==='not_eligible'?409:result.state==='unauthorized'?401:503;return NextResponse.json(result,{status,headers});}
 catch{return NextResponse.json({error:'Collecte interrompue ou bilan non confirmé',sendingEnabled:false},{status:503,headers});}
}
