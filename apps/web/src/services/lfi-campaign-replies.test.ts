import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { TenantContext } from "@/types/domain";
const m=vi.hoisted(()=>({db:vi.fn(),connect:vi.fn(),rpc:vi.fn(),close:vi.fn(),updates:vi.fn(),pages:[] as {table:string;cursor:string|undefined}[],fail:false}));
vi.mock("@/lib/supabase/service-role",()=>({createSupabaseServiceRoleClient:m.db}));
vi.mock("./ionos-connection",()=>({canManageIonos:()=>true,IONOS_SENDER:"sender@example.invalid"}));
vi.mock("imapflow",()=>({ImapFlow:class {
 on(){} close=m.close; connect=m.connect;
 async mailboxOpen(){return {uidValidity:BigInt(1),uidNext:3};}
 async *fetch(){yield {uid:2,envelope:{from:[{address:"person1200@example.invalid"}],inReplyTo:"<message1200>"},internalDate:new Date("2026-10-29T10:00:00Z")};}
}}));
import { syncLfiCampaignReplies } from "./lfi-campaign-replies";
const context={tenantId:"tenant",role:"owner"} as TenantContext;
beforeEach(()=>{
 vi.clearAllMocks();m.pages=[];m.fail=false;vi.stubEnv("LFI_IONOS_SMTP_PASSWORD","test-only");
 m.rpc.mockResolvedValue({error:null});
 m.db.mockReturnValue({rpc:m.rpc,from:(table:string)=>{
  let cursor:string|undefined;let update=false;
  const result=()=>{
   if(table==="lfi_campaigns")return {error:null,data:{id:"campaign",mailbox_last_uid:1,mailbox_uidvalidity:"1"}};
   m.pages.push({table,cursor});
   if(m.fail&&cursor)return {error:{message:"unavailable"},data:null};
   const rows=Array.from({length:1251},(_,i)=>({id:String(i).padStart(4,"0"),email:`person${i}@example.invalid`,recipient_id:String(i).padStart(4,"0"),message_id:`<message${i}>`,claimed_at:"2026-10-29T09:00:00Z"}));
   return {error:null,data:rows.filter(r=>!cursor||r.id>cursor).slice(0,500)};
  };
  const q={select:()=>q,eq:()=>q,in:()=>q,order:()=>q,limit:()=>q,gt:(_key:string,value:string)=>{cursor=value;return q;},update:(value:unknown)=>{update=true;m.updates(value);return q;},single:async()=>result(),then:(resolve:(v:unknown)=>unknown)=>Promise.resolve(update?{error:null}:result()).then(resolve)};
  return q;
 }});
});
afterEach(()=>vi.unstubAllEnvs());
it("checks replies beyond 1000 recipients and paginates sent messages",async()=>{
 const result=await syncLfiCampaignReplies(context);
 expect(result.complete).toBe(true);
 expect(m.pages.filter(p=>p.table==="lfi_recipients")).toHaveLength(3);
 expect(m.pages.filter(p=>p.table==="lfi_outbox")).toHaveLength(3);
 expect(m.rpc).toHaveBeenCalledWith("lfi_stop_recipient",{p_tenant:"tenant",p_email:"person1200@example.invalid",p_reason:"replied"});
 expect(m.updates).toHaveBeenLastCalledWith(expect.objectContaining({mailbox_last_uid:2,mailbox_checked_at:expect.any(String)}));
});
it("keeps freshness cleared and never connects if a later page fails",async()=>{
 m.fail=true;
 await expect(syncLfiCampaignReplies(context)).rejects.toThrow("destinataires");
 expect(m.connect).not.toHaveBeenCalled();
 expect(m.updates).toHaveBeenCalledOnce();
 expect(m.updates).toHaveBeenCalledWith({mailbox_checked_at:null});
});
