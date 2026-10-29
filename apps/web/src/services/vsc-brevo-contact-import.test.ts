import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { rpc, from, identity } = vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn(),identity:vi.fn()}));
vi.mock("@/lib/supabase/service-role",()=>({createSupabaseServiceRoleClient:()=>({rpc,from})}));
vi.mock("./vsc-brevo-sms-status",()=>({inspectVscBrevoSmsAccount:identity}));
import { assertVscBrevoImportEnvironment, previewVscBrevoContactImport, executeVscBrevoContactImport, importVscBrevoContactGroups, vscBrevoImportPersonId } from "./vsc-brevo-contact-import";
import { normalizeVscBrevoContact,groupVscBrevoContacts } from "@/features/vsc-campaign/brevo-contact-import";
const tenant="20000000-0000-0000-0000-000000000001",actor="10000000-0000-0000-0000-000000000001";
const fetchMock=vi.fn();
const response=(value:unknown)=>({ok:true,json:async()=>value});
describe("VSC Brevo import boundary",()=>{
  beforeEach(()=>{
    vi.resetAllMocks(); vi.stubEnv("VSC_OVH_TENANT_ID",tenant);vi.stubEnv("VERCEL_ENV","preview");vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL","https://mahgxumwucxehsooijag.supabase.co");vi.stubEnv("BREVO_VSC_API_KEY","synthetic-vsc");vi.stubGlobal("fetch",fetchMock);
    identity.mockResolvedValue({state:"identity_verified"});
    const query={select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),order:vi.fn().mockReturnThis(),range:vi.fn().mockResolvedValue({data:[],error:null})};from.mockReturnValue(query);
    fetchMock.mockImplementation(async(url:string)=>response(url.includes("contacts/lists")?{lists:[{id:4,name:"VSC source"}],count:1}:{contacts:[{id:1,email:"shop@example.com",emailBlacklisted:false,smsBlacklisted:true,listIds:[4]}],count:1}));
    rpc.mockResolvedValue({data:{created:1,matched:0,conflicts:0,withoutCoordinates:0,sourceContacts:1,cancelled:0},error:null});
  });
  afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
  it("rejects production, unknown databases and foreign tenants before network or SQL",async()=>{
    for(const url of ["https://aqmuvakvienfwzhgzhcw.supabase.co","https://mahgxumwucxehsooijag.supabase.co/other","https://user@mahgxumwucxehsooijag.supabase.co"]){vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL",url);expect(()=>assertVscBrevoImportEnvironment()).toThrow();}
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL","https://mahgxumwucxehsooijag.supabase.co");vi.stubEnv("VERCEL_ENV","production");await expect(previewVscBrevoContactImport(tenant)).rejects.toThrow();
    vi.stubEnv("VERCEL_ENV","preview");await expect(previewVscBrevoContactImport(actor)).rejects.toThrow();expect(fetchMock).not.toHaveBeenCalled();expect(from).not.toHaveBeenCalled();
  });
  it("requires verified dedicated account identity",async()=>{identity.mockResolvedValue({state:"identity_mismatch"});await expect(previewVscBrevoContactImport(tenant)).rejects.toThrow();expect(fetchMock).not.toHaveBeenCalled();expect(rpc).not.toHaveBeenCalled();});
  it("reads provider with bounded GET only and exposes summary instead of coordinates",async()=>{
    const result=await previewVscBrevoContactImport(tenant);expect(result.summary).toMatchObject({sourceContacts:1,emailCandidates:1,sourceSmsBlocked:1,existingAtlasContacts:0});expect(result.lists).toEqual([{id:4,name:"VSC source",contacts:1,emailBlocked:0,smsBlocked:1}]);
    expect(JSON.stringify(result)).not.toContain("shop@example.com");expect(result.sendingEnabled).toBe(false);expect(rpc).not.toHaveBeenCalled();
    for(const [url,options] of fetchMock.mock.calls){expect(url).toMatch(/^https:\/\/api.brevo.com\/v3\/contacts/);expect(options).toMatchObject({method:"GET",headers:{"api-key":"synthetic-vsc"},redirect:"error",cache:"no-store"});expect(options.signal).toBeInstanceOf(AbortSignal);}
  });
  it("refetches and refuses a stale preview before any write",async()=>{
    const preview=await previewVscBrevoContactImport(tenant);fetchMock.mockImplementation(async(url:string)=>response(url.includes("lists")?{lists:[]}:{contacts:[],count:0}));
    await expect(executeVscBrevoContactImport(tenant,actor,preview.reviewKey)).rejects.toThrow("changé");expect(rpc).not.toHaveBeenCalled();
  });
  it("imports only fresh server-built groups and verified actor",async()=>{
    const preview=await previewVscBrevoContactImport(tenant);const result=await executeVscBrevoContactImport(tenant,actor,preview.reviewKey);expect(result).toMatchObject({created:1,sendingEnabled:false});expect(rpc).toHaveBeenCalledExactlyOnceWith("vsc_import_brevo_contacts",{p_tenant_id:tenant,p_actor_id:actor,p_groups:[expect.objectContaining({email:"shop@example.com",source_ids:[1],sms_blocked:true})]});
  });
  it("handles provider partial pages but rejects duplicate IDs, changing counts and incomplete reads",async()=>{
    fetchMock.mockReset();fetchMock.mockResolvedValueOnce(response({contacts:[{id:1}],count:2})).mockResolvedValueOnce(response({contacts:[{id:2}],count:2})).mockResolvedValueOnce(response({lists:[]}));expect((await previewVscBrevoContactImport(tenant)).summary.sourceContacts).toBe(2);
    for(const second of [{contacts:[{id:1}],count:2},{contacts:[{id:2}],count:3},{contacts:[],count:2}]){fetchMock.mockReset();fetchMock.mockResolvedValueOnce(response({contacts:[{id:1}],count:2})).mockResolvedValueOnce(response(second));await expect(previewVscBrevoContactImport(tenant)).rejects.toThrow();}
    expect(rpc).not.toHaveBeenCalled();
  });
  it("caps source size and refuses malformed preview tokens before reading",async()=>{
    await expect(executeVscBrevoContactImport(tenant,actor,"invalid")).rejects.toThrow();expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValue(response({contacts:[],count:5001}));await expect(previewVscBrevoContactImport(tenant)).rejects.toThrow();expect(rpc).not.toHaveBeenCalled();
  });
  it("batches at 100, stops on ambiguous database failure without automatic retry",async()=>{
    const rows=Array.from({length:101},(_,i)=>normalizeVscBrevoContact({id:i+1,email:`shop${i}@example.com`}));const groups=groupVscBrevoContacts(rows,id=>vscBrevoImportPersonId(tenant,id));
    rpc.mockResolvedValueOnce({data:{created:100,matched:0,conflicts:0,withoutCoordinates:0,sourceContacts:100,cancelled:0},error:null}).mockResolvedValueOnce({data:null,error:{message:"private"}});
    await expect(importVscBrevoContactGroups(tenant,actor,groups)).rejects.toThrow("Certaines fiches");expect(rpc).toHaveBeenCalledTimes(2);expect(rpc.mock.calls[0][1].p_groups).toHaveLength(100);expect(rpc.mock.calls[1][1].p_groups).toHaveLength(1);
  });
});
