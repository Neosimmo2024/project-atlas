import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/types/domain";
const m=vi.hoisted(()=>({db:vi.fn(),rpc:vi.fn(),eq:vi.fn()}));
vi.mock("@/lib/supabase/service-role",()=>({createSupabaseServiceRoleClient:m.db}));
import { confirmLfiRegistration, plannedLfiDate } from "./lfi-campaign-preparation";
const tenantId="11111111-1111-4111-8111-111111111111";
const context={tenantId,role:"owner"} as TenantContext;
let missing:boolean;
beforeEach(()=>{
 vi.clearAllMocks();missing=false;vi.stubEnv("LFI_IONOS_TENANT_ID",tenantId);
 m.rpc.mockResolvedValue({error:null});
 m.db.mockReturnValue({rpc:m.rpc,from:(table:string)=>{
  const q={select:()=>q,eq:(...args:unknown[])=>{m.eq(...args);return q;},single:async()=>table==="lfi_campaigns"?{data:{id:"campaign"},error:null}:missing?{data:null,error:{code:"missing"}}:{data:{email:"registered@example.invalid"},error:null}};
  return q;
 }});
});
afterEach(()=>vi.unstubAllEnvs());
describe("LFI registration and draft planning",()=>{
 it("denies another tenant before database access",async()=>{
  await expect(confirmLfiRegistration({...context,tenantId:"other"},"id")).rejects.toThrow();expect(m.db).not.toHaveBeenCalled();
 });
 it("scopes the recipient to the current campaign and tenant",async()=>{
  await confirmLfiRegistration(context,"recipient");
  expect(m.eq).toHaveBeenCalledWith("tenant_id",tenantId);expect(m.eq).toHaveBeenCalledWith("campaign_id","campaign");
  expect(m.rpc).toHaveBeenCalledWith("lfi_stop_recipient",{p_tenant:tenantId,p_email:"registered@example.invalid",p_reason:"registered"});
 });
 it("never suppresses an unresolved recipient",async()=>{
  missing=true;await expect(confirmLfiRegistration(context,"foreign")).rejects.toThrow();expect(m.rpc).not.toHaveBeenCalled();
 });
 it("reports an unsuccessful database stop",async()=>{
  m.rpc.mockResolvedValue({error:{code:"failure"}});await expect(confirmLfiRegistration(context,"recipient")).rejects.toThrow();
 });
 it("accepts a future instant before the training",()=>expect(plannedLfiDate("2026-11-02T09:00:00Z",Date.parse("2026-10-28T08:00:00Z"))).toBe("2026-11-02T09:00:00.000Z"));
 it.each(["invalid","2026-10-01T09:00:00Z","2026-12-03T00:00:00Z","2026-11-02T09:00:00"])("rejects invalid, past, late or ambiguous time: %s",value=>expect(()=>plannedLfiDate(value,Date.parse("2026-10-28T08:00:00Z"))).toThrow());
});
