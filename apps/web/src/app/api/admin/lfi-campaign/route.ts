import { confirmLfiRegistration, planLfiDrafts } from "@/services/lfi-campaign-preparation";
import { NextResponse } from "next/server";
import { getTenantContext } from "@/repositories/tenant-context";
import { canManageIonos } from "@/services/ionos-connection";
import { lfiCampaignOverview, prepareLfiPilot, queueLfiInitialDrafts } from "@/services/lfi-campaigns";
import { syncLfiCampaignReplies } from "@/services/lfi-campaign-replies";
export const runtime="nodejs";
export const maxDuration=60;
export async function POST(request:Request){
 const headers={"Cache-Control":"no-store"};
 if(request.headers.get("origin")!==new URL(request.url).origin)return NextResponse.json({error:"Origine non autorisée."},{status:403,headers});
 try{
  const context=await getTenantContext();
  if(!context || !canManageIonos(context))return NextResponse.json({error:"Accès non autorisé."},{status:403,headers});
  const body=await request.json();
  let result;
  if(body.action==="prepare")result=await prepareLfiPilot(context);
  else if(body.action==="sync")result=await syncLfiCampaignReplies(context);
  else if(body.action==="draft" && Array.isArray(body.ids) && body.ids.every((id:unknown)=>typeof id==="string" && /^[a-f0-9-]{36}$/i.test(id)))result=await queueLfiInitialDrafts(context,body.ids);
  else if(body.action==="registered" && typeof body.recipientId==="string" && /^[a-f0-9-]{36}$/i.test(body.recipientId))result=await confirmLfiRegistration(context,body.recipientId);
  else if(body.action==="plan" && typeof body.dueAt==="string")result=await planLfiDrafts(context,body.dueAt);
  else if(body.action==="status")result=await lfiCampaignOverview(context);
  else return NextResponse.json({error:"Action non disponible."},{status:400,headers});
  return NextResponse.json({success:true,result},{headers});
 }catch{return NextResponse.json({error:"Opération impossible. Vérifiez la sélection et la disponibilité du service."},{status:503,headers});}
}
