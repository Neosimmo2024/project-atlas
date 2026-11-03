import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const {rpc,limit}=vi.hoisted(()=>({rpc:vi.fn(),limit:vi.fn()}));
vi.mock('@/lib/supabase/service-role',()=>({createSupabaseServiceRoleClient:()=>({rpc,from:()=>({select:()=>({eq:()=>({order:()=>({order:()=>({limit})})})})})})}));
import {previewVscSmsAudience,saveVscSmsAudience} from './vsc-sms-audience';
const tenant='20000000-0000-0000-0000-000000000001',actor='10000000-0000-0000-0000-000000000001';
const contacts=[{id:actor,display_name:'Synthetic',mobile:'+33612345678',has_email:true}];
describe('VSC immutable SMS audience',()=>{
 beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('VSC_OVH_TENANT_ID',tenant);vi.stubEnv('VERCEL_ENV','preview');vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://mahgxumwucxehsooijag.supabase.co');rpc.mockResolvedValue({data:contacts,error:null});limit.mockResolvedValue({data:[],error:null});});
 afterEach(()=>vi.unstubAllEnvs());
 it('previews counts without returning contact data',async()=>{const p=await previewVscSmsAudience(tenant);expect(p).toMatchObject({recipients:1,emailMobile:1,mobileOnly:0,sendingEnabled:false});expect(JSON.stringify(p)).not.toContain('Synthetic');expect(JSON.stringify(p)).not.toContain('+336');});
 it('rejects other tenants and production before database access',async()=>{await expect(previewVscSmsAudience(actor)).rejects.toThrow();vi.stubEnv('VERCEL_ENV','production');await expect(previewVscSmsAudience(tenant)).rejects.toThrow();expect(rpc).not.toHaveBeenCalled();});
 it('rejects a stale selection before writing',async()=>{const p=await previewVscSmsAudience(tenant);rpc.mockResolvedValue({data:[],error:null});await expect(saveVscSmsAudience(tenant,actor,p.reviewKey)).rejects.toThrow('Sélection modifiée');expect(rpc.mock.calls.every(c=>c[0]==='vsc_sms_audience_contacts')).toBe(true);});
 it('saves only canonical server contacts under a deterministic identity',async()=>{const p=await previewVscSmsAudience(tenant);rpc.mockImplementation(async(name,args)=>name==='vsc_save_sms_audience'?{data:{id:args.p_id,recipients:1,emailMobile:1,mobileOnly:0,reused:false},error:null}:{data:contacts,error:null});const a=await saveVscSmsAudience(tenant,actor,p.reviewKey);const b=await saveVscSmsAudience(tenant,actor,p.reviewKey);expect(a.id).toBe(b.id);expect(a.sendingEnabled).toBe(false);expect(rpc).toHaveBeenCalledWith('vsc_save_sms_audience',expect.objectContaining({p_tenant_id:tenant,p_actor_id:actor,p_contacts:contacts}));});
 it('fails closed on duplicates or a possibly truncated source',async()=>{for(const data of [[...contacts,...contacts],Array(1000).fill(contacts[0])]){rpc.mockResolvedValue({data,error:null});await expect(previewVscSmsAudience(tenant)).rejects.toThrow();}});
});
