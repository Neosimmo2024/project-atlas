import {beforeEach,describe,it,expect,vi} from "vitest";
const mocks=vi.hoisted(()=>({db:vi.fn(),single:vi.fn(),rpc:vi.fn()}));
vi.mock('@/lib/supabase/service-role',()=>({createSupabaseServiceRoleClient:mocks.db}));
import {GET,POST} from './route';
const token='a'.repeat(64);
beforeEach(()=>{vi.clearAllMocks();mocks.db.mockReturnValue({from:()=>({select:()=>({eq:()=>({maybeSingle:mocks.single})})}),rpc:mocks.rpc});mocks.single.mockResolvedValue({data:{tenant_id:'tenant',email:'agent@example.com'},error:null});mocks.rpc.mockResolvedValue({error:null});});
describe('LFI unsubscribe',()=>{
 it('does not unsubscribe on scanner GET',async()=>{const response=await GET(new Request('https://atlas.test/lfi/unsubscribe?token='+token));expect(response.status).toBe(200);expect(await response.text()).toContain('Confirmer ma désinscription');expect(mocks.db).not.toHaveBeenCalled();});
 it('rejects malformed tokens before querying',async()=>{expect((await POST(new Request('https://atlas.test/lfi/unsubscribe',{method:'POST',body:'token=invalid'}))).status).toBe(400);expect(mocks.db).not.toHaveBeenCalled();});
 it('stops the recipient using server-resolved identity',async()=>{const response=await POST(new Request('https://atlas.test/lfi/unsubscribe',{method:'POST',body:'token='+token}));expect(response.status).toBe(200);expect(mocks.rpc).toHaveBeenCalledWith('lfi_stop_recipient',{p_tenant:'tenant',p_email:'agent@example.com',p_reason:'unsubscribed'});expect(await response.text()).not.toContain('agent@example.com');});
 it('accepts mail-provider one-click POST without a login',async()=>{const response=await POST(new Request('https://atlas.test/lfi/unsubscribe?token='+token,{method:'POST',body:'List-Unsubscribe=One-Click'}));expect(response.status).toBe(200);});
 it('never reports success if exclusion storage fails',async()=>{mocks.rpc.mockResolvedValue({error:{message:'private'}});const response=await POST(new Request('https://atlas.test/lfi/unsubscribe',{method:'POST',body:'token='+token}));expect(response.status).toBe(503);expect(await response.text()).not.toContain('private');});
});
