import { ImapFlow } from "imapflow";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import type { TenantContext } from "@/types/domain";
import { canManageIonos, IONOS_SENDER } from "./ionos-connection";
import { LFI_PROJECT_ID } from "./lfi-campaign-policy";

export async function syncLfiCampaignReplies(context: TenantContext) {
 if (!canManageIonos(context) || !process.env.LFI_IONOS_SMTP_PASSWORD) throw new Error("Connexion indisponible.");
 const db=createSupabaseServiceRoleClient();
 const cfg=await db.from("lfi_campaigns").select("id,mailbox_last_uid,mailbox_uidvalidity").eq("tenant_id",context.tenantId).eq("project_id",LFI_PROJECT_ID).single();
 if(cfg.error)throw new Error("Préparez d’abord la campagne.");
 // Clear freshness before inspecting: an interrupted scan must block the dispatcher.
 const cleared=await db.from("lfi_campaigns").update({mailbox_checked_at:null}).eq("id",cfg.data.id);
 if(cleared.error)throw new Error("Contrôle indisponible.");
 const recipients=await db.from("lfi_recipients").select("id,email").eq("campaign_id",cfg.data.id).eq("status","ready").limit(1001);
 if(recipients.error || recipients.data.length > 1000)throw new Error("Contrôle indisponible.");
 const outbox=await db.from("lfi_outbox").select("recipient_id,message_id,claimed_at").eq("tenant_id",context.tenantId).in("status",["claimed","accepted","uncertain"]).order("claimed_at").limit(10001);
 if(outbox.error || outbox.data.length>10000)throw new Error("Contrôle de volume requis.");
 const imap=new ImapFlow({host:"imap.ionos.fr",port:993,secure:true,auth:{user:IONOS_SENDER,pass:process.env.LFI_IONOS_SMTP_PASSWORD},tls:{minVersion:"TLSv1.2",rejectUnauthorized:true},logger:false,disableAutoIdle:true,connectionTimeout:8000,greetingTimeout:8000,socketTimeout:10000,maxLiteralSize:600000,maxResponseSize:4000000});
 imap.on("error",()=>imap.close());
 const timeout=setTimeout(()=>imap.close(),25000);
 let phase="connect";
 try {
  await imap.connect();
  phase="open";
  const mailbox=await imap.mailboxOpen("INBOX",{readOnly:true});
  const validity=mailbox.uidValidity.toString();
  const cursor=cfg.data.mailbox_uidvalidity===validity?Number(cfg.data.mailbox_last_uid):0;
  const last=mailbox.uidNext-1;
  // Before any send, start watching at the current end; no historical mail import.
  const upper=outbox.data.length?Math.min(last,cursor+500):last;
  const pendingBounces: number[]=[];
  let stopped=0;
  const stop=async(email:string,reason:string)=>{
   const result=await db.rpc("lfi_stop_recipient",{p_tenant:context.tenantId,p_email:email,p_reason:reason});
   if(result.error)throw new Error("STOP_FAILED");
   stopped++;
  };
  if(upper>cursor && outbox.data.length){
   phase="envelopes";
   for await(const message of imap.fetch(`${cursor+1}:${upper}`,{envelope:true,internalDate:true},{uid:true})){
    const sender=message.envelope?.from?.[0]?.address?.toLowerCase();
    const recipient=recipients.data.find(r=>r.email===sender);
    const sent=recipient?outbox.data.filter(o=>o.recipient_id===recipient.id):[];
    if(recipient && sent.some(o=>message.envelope?.inReplyTo===o.message_id || (message.internalDate instanceof Date && message.internalDate.getTime()>=Date.parse(o.claimed_at)))) await stop(recipient.email,"replied");
    if(sender && /mailer-daemon|postmaster/.test(sender))pendingBounces.push(message.uid);
   }
   // Never issue another IMAP command inside the fetch iterator.
   for(const uid of pendingBounces){
    phase="bounce-source";
    const message=await imap.fetchOne(uid,{source:true},{uid:true});
    if(!message || !message.source)throw new Error("BOUNCE_UNREADABLE");
    const source=message.source.toString("utf8");
    for(const row of outbox.data){
     if(source.includes(row.message_id)){
      const recipient=recipients.data.find(r=>r.id===row.recipient_id);
      if(recipient)await stop(recipient.email,"bounced");
     }
    }
   }
  }
  const complete=upper>=last;
  phase="save";
  const saved=await db.from("lfi_campaigns").update({mailbox_uidvalidity:validity,mailbox_last_uid:upper,mailbox_checked_at:complete?new Date().toISOString():null}).eq("id",cfg.data.id);
  if(saved.error)throw new Error("SAVE_FAILED");
  return {success:true,complete,stopped,message:complete?`Contrôle terminé : ${stopped} arrêt(s) de relance.`:"Contrôle partiel : poursuivre la vérification avant tout envoi."};
 }catch(error){
  const code=error && typeof error==="object" && "code" in error ? String(error.code) : "UNKNOWN";
  const response=error && typeof error==="object" && "response" in error && typeof error.response==="string" ? error.response : "";
  const detail=response || (error instanceof Error ? error.message : "Unknown error");
  const safeDetail=detail.replaceAll(process.env.LFI_IONOS_SMTP_PASSWORD ?? "INVALID_EMPTY_SECRET","[redacted]").replace(/[^\\s@]+@[^\\s@]+/g,"[address]").slice(0,200);
  console.error("LFI mailbox check failed",{phase,code:/^[A-Za-z0-9_ -]{1,80}$/.test(code)?code:"UNKNOWN",detail:safeDetail});
  throw new Error("Contrôle des réponses indisponible. Les envois restent bloqués.");
 }
 finally{clearTimeout(timeout);imap.close();}
}
