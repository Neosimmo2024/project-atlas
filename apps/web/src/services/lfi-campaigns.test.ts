import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/types/domain";
const m = vi.hoisted(() => ({ db: vi.fn(), rpc: vi.fn(), transport: vi.fn(), send: vi.fn(), close: vi.fn(), overlaps: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/supabase/service-role", () => ({ createSupabaseServiceRoleClient: m.db }));
vi.mock("./ionos-connection", async original => ({ ...await original<typeof import("./ionos-connection")>(), createIonosTransport: m.transport }));
vi.mock("./lfi-campaign-overlap", () => ({ lfiOtherCampaignExclusions: m.overlaps }));
import { dispatchLfiOne } from "./lfi-campaigns";
const tenantId = "11111111-1111-4111-8111-111111111111";
const context = { tenantId, role: "owner", userId: "test" } as TenantContext;
let suppressed: boolean;
let rejected: boolean;
let saveError: boolean;
beforeEach(() => {
 vi.clearAllMocks(); suppressed=false; rejected=false; saveError=false;
 vi.stubEnv("LFI_IONOS_TENANT_ID", tenantId);
 vi.stubEnv("LFI_IONOS_SMTP_PASSWORD", "test-only");
 vi.stubEnv("LFI_CAMPAIGN_PUBLIC_ORIGIN", "https://atlas.example.invalid");
 m.rpc.mockResolvedValue({data:[{id:"message",recipient_id:"recipient",message_id:"<test@example.invalid>",subject:"Formation",body_text:"Bonjour"}],error:null});
 m.overlaps.mockResolvedValue(new Set());
 m.send.mockResolvedValue({accepted:["person@example.invalid"]});
 m.transport.mockReturnValue({sendMail:m.send,close:m.close});
 m.db.mockReturnValue({rpc:m.rpc,from:(table:string)=>{
  const result=()=>({error:table==="lfi_outbox"&&saveError?{code:"failure"}:null,data:table==="lfi_recipients"?{email:"person@example.invalid",status:"ready",person_id:"person",unsubscribe_token:"a".repeat(64)}:table==="lfi_suppressions"?(suppressed?{email:"person@example.invalid"}:null):table==="people"?{primary_email:"person@example.invalid",postal_code:"94100",job_title:"agent immobilier",contact_allowed:true,do_not_contact:false,status:rejected?"rejected":"qualified"}:null});
  const query={select:()=>query,eq:()=>query,single:async()=>result(),maybeSingle:async()=>result(),update:(value:unknown)=>{m.update(value);return query;},then:(resolve:(value:unknown)=>unknown)=>Promise.resolve(result()).then(resolve)};
  return query;
 }});
});
afterEach(()=>vi.unstubAllEnvs());
describe("LFI campaign delivery safety",()=>{
 it("rejects another tenant before querying or sending",async()=>{
  await expect(dispatchLfiOne({...context,tenantId:"other"})).rejects.toThrow();
  expect(m.db).not.toHaveBeenCalled();expect(m.transport).not.toHaveBeenCalled();
 });
 it("does not send without an atomic claim",async()=>{
  m.rpc.mockResolvedValue({data:[],error:null});await dispatchLfiOne(context);expect(m.transport).not.toHaveBeenCalled();
 });
 it.each(["suppression","rejected","overlap"])("blocks a contact after claim: %s",async reason=>{
  suppressed=reason==="suppression";rejected=reason==="rejected";
  if(reason==="overlap")m.overlaps.mockResolvedValue(new Set(["person"]));
  expect((await dispatchLfiOne(context)).success).toBe(false);
  expect(m.transport).not.toHaveBeenCalled();expect(m.update).toHaveBeenCalledWith(expect.objectContaining({status:"cancelled"}));
 });
 it("includes working unsubscribe headers and records SMTP acceptance",async()=>{
  expect((await dispatchLfiOne(context)).success).toBe(true);
  expect(m.send).toHaveBeenCalledWith(expect.objectContaining({to:"person@example.invalid",headers:{"List-Unsubscribe":`<https://atlas.example.invalid/lfi/unsubscribe?token=${"a".repeat(64)}>`,"List-Unsubscribe-Post":"List-Unsubscribe=One-Click"}}));
  expect(m.update).toHaveBeenCalledWith(expect.objectContaining({status:"accepted"}));expect(m.close).toHaveBeenCalledOnce();
 });
 it("never retries an ambiguous SMTP failure",async()=>{
  m.send.mockRejectedValue(new Error("private transport detail"));
  const result=await dispatchLfiOne(context);expect(result.success).toBe(false);
  expect(JSON.stringify(result)).not.toContain("private transport detail");expect(m.send).toHaveBeenCalledOnce();
  expect(m.update).toHaveBeenCalledWith(expect.objectContaining({status:"uncertain"}));expect(m.close).toHaveBeenCalledOnce();
 });
 it("does not claim success if acceptance cannot be recorded",async()=>{
  saveError=true;expect((await dispatchLfiOne(context)).success).toBe(false);expect(m.send).toHaveBeenCalledOnce();
 });
});
