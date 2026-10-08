import { NextResponse } from "next/server";
import { getTenantContext } from "@/repositories/tenant-context";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
export async function GET(request: Request) {
 const context = await getTenantContext();
 if (!context || !["owner","admin"].includes(context.role)) return NextResponse.json({error:"Action non autorisée."},{status:403});
 const batch = new URL(request.url).searchParams.get("batch") || "A";
 if (!["A","B"].includes(batch)) return NextResponse.json({error:"Groupe invalide."},{status:400});
 const db = createSupabaseServiceRoleClient();
 const result = await db.from("interactions").select("id,person_id,summary,metadata").eq("tenant_id",context.tenantId).eq("metadata->>campaign_key","lmd-ab-20261004").eq("metadata->>batch",batch).is("deleted_at",null).order("created_at");
 if(result.error) return NextResponse.json({error:"Lecture impossible."},{status:500});
 const rows = result.data ?? [];
 const ids = [...new Set(rows.map(r=>r.person_id).filter((id): id is string=>typeof id==="string"))];
 const people = ids.length ? await db.from("people").select("id,display_name,contact_allowed,do_not_contact").eq("tenant_id",context.tenantId).in("id",ids) : {data:[],error:null};
 if(people.error) return NextResponse.json({error:"Lecture contacts impossible."},{status:500});
 const map = new Map((people.data??[]).map(p=>[p.id,p]));
 const items = rows.filter(r=> {const m=r.metadata as Record<string,unknown>|null; const p=map.get(r.person_id??""); return m?.status==="scheduled" && !m.provider_message_id && !m.provider_scheduled_message_id && p?.contact_allowed && !p.do_not_contact;}).map(r=> {
 const m=r.metadata as Record<string,unknown>;return {interactionId:r.id,displayName:map.get(r.person_id??"")?.display_name,recipientEmail:m.recipient_email,subject:(r.summary??"").split("\n").find((l:string)=>l.startsWith("Objet : "))?.slice(8),body:r.summary};
 });
 return NextResponse.json({data:items,total:rows.length,confirmed:rows.filter(r=>["sent","provider_scheduled"].includes((r.metadata as Record<string,string>|null)?.status??"")).length});
}
