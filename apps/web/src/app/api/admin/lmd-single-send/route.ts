import { NextResponse } from "next/server";
import { getTenantContext } from "@/repositories/tenant-context";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { sendLmdSingleEmail } from "@/services/lmd-single-send";
export async function POST(request: Request) {
 if(request.headers.get("origin")!==new URL(request.url).origin) return NextResponse.json({error:"Origine non autorisée."},{status:403});
 const context=await getTenantContext();
 if(!context||!["owner","admin"].includes(context.role)) return NextResponse.json({error:"Action non autorisée."},{status:403});
 const input=await request.json().catch(()=>null) as {interactionId?:string}|null;
 if(!input?.interactionId) return NextResponse.json({error:"Interaction requise."},{status:400});
 const db=createSupabaseServiceRoleClient();
 const {data:item,error}=await db.from("interactions").select("id,person_id,summary,metadata").eq("tenant_id",context.tenantId).eq("id",input.interactionId).is("deleted_at",null).maybeSingle();
 if(error||!item?.person_id||!item.summary) return NextResponse.json({error:"Interaction introuvable."},{status:404});
 const m=(item.metadata??{}) as Record<string,string>;
 if(m.campaign_key!=="lmd-ab-20261004"||!["A","B"].includes(m.batch)) return NextResponse.json({error:"Campagne non autorisée."},{status:409});
 if(m.provider_message_id||m.provider_scheduled_message_id||["sent","provider_scheduled"].includes(m.status)) return NextResponse.json({data:{duplicatePrevented:true}});
 if(m.status!=="scheduled") return NextResponse.json({error:"Contrôle requis : une opération est déjà en cours ou incertaine."},{status:409});
 const personResult=await db.from("people").select("display_name,contact_allowed,do_not_contact").eq("tenant_id",context.tenantId).eq("id",item.person_id).maybeSingle();
 const p=personResult.data;
 if(personResult.error||!p?.contact_allowed||p.do_not_contact) return NextResponse.json({error:"Contact interdit."},{status:409});
 const lines=item.summary.split("\n"),index=lines.findIndex(l=>l.startsWith("Objet : "));
 if(index<0||!m.recipient_email) return NextResponse.json({error:"Message incomplet."},{status:409});
 const subject=lines[index].slice(8).trim(),textContent=lines.slice(index+1).join("\n").trim();
 if(subject.includes("[TEST]")||textContent.includes("[TEST]")) return NextResponse.json({error:"Marqueur TEST interdit."},{status:409});
 const scheduledAt=m.batch==="B"?"2026-10-08T07:30:00.000Z":undefined;
 if(scheduledAt&&Date.parse(scheduledAt)<=Date.now()) return NextResponse.json({error:"Date de programmation passée : contrôle requis."},{status:409});
 const claimed={...m,status:"dispatching",dispatch_started_at:new Date().toISOString(),sender_email:"renato.ponzio@neos-immo.com"};
 const claim=await db.from("interactions").update({metadata:claimed}).eq("tenant_id",context.tenantId).eq("id",item.id).eq("metadata",item.metadata).select("id");
 if(claim.error||claim.data?.length!==1) return NextResponse.json({error:"Opération concurrente ou verrou impossible."},{status:409});
 const sent=await sendLmdSingleEmail({requestId:["lmd-ab-20261004",m.batch,item.person_id].join(":"),recipient:m.recipient_email,recipientName:p.display_name,subject,textContent,scheduledAt});
 if(!sent.success) {
 await db.from("interactions").update({metadata:{...claimed,status:"needs_review",last_error:sent.error}}).eq("tenant_id",context.tenantId).eq("id",item.id).eq("metadata->>status","dispatching");
 return NextResponse.json({error:sent.error},{status:502});
 }
 const now=new Date().toISOString();
 const metadata=scheduledAt?{...claimed,status:"provider_scheduled",provider_scheduled_message_id:sent.messageId,provider_scheduled_at:now,scheduled_at:scheduledAt}:{...claimed,status:"sent",provider_message_id:sent.messageId,sent_at:now};
 const saved=await db.from("interactions").update({metadata,updated_at:now}).eq("tenant_id",context.tenantId).eq("id",item.id).eq("metadata->>status","dispatching").select("id");
 if(saved.error||saved.data?.length!==1) return NextResponse.json({error:"Brevo a confirmé mais l’historique doit être réconcilié. Ne pas renvoyer.",messageId:sent.messageId},{status:409});
 return NextResponse.json({data:{messageId:sent.messageId,scheduledAt:scheduledAt??null}});
}
