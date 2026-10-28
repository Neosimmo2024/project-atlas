import { NextResponse } from "next/server";
import { isAuthorizedRecruitmentOrchestrator } from "@/services/recruitment-email-orchestrator";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { LFI_PROJECT_ID } from "@/services/lfi-campaign-policy";
import { syncLfiCampaignReplies } from "@/services/lfi-campaign-replies";
import { dispatchLfiOne } from "@/services/lfi-campaigns";
import type { TenantContext } from "@/types/domain";
export const runtime="nodejs";
export const maxDuration=60;
export async function POST(request:Request){
 const headers={"Cache-Control":"no-store"};
 if(!await isAuthorizedRecruitmentOrchestrator(request))return NextResponse.json({error:"Accès non autorisé."},{status:401,headers});
 try{
  const tenantId=process.env.LFI_IONOS_TENANT_ID;
  if(!tenantId)return NextResponse.json({message:"Campagne non configurée."},{headers});
  const db=createSupabaseServiceRoleClient();
  const campaign=await db.from("lfi_campaigns").select("id").eq("tenant_id",tenantId).eq("project_id",LFI_PROJECT_ID).eq("status","active").maybeSingle();
  if(campaign.error)throw new Error("UNAVAILABLE");
  if(!campaign.data)return NextResponse.json({message:"Aucune campagne IONOS active."},{headers});
  const context={tenantId,userId:"background-worker",role:"owner",tenant:{id:tenantId,name:"LFI"}} as TenantContext;
  const sync=await syncLfiCampaignReplies(context);
  if(!sync.complete)return NextResponse.json(sync,{headers});
  return NextResponse.json(await dispatchLfiOne(context),{headers});
 }catch{return NextResponse.json({error:"Traitement interrompu. Aucun renvoi automatique des résultats incertains."},{status:503,headers});}
}
