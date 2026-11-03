import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const {context,manage,preview,save}=vi.hoisted(()=>({context:vi.fn(),manage:vi.fn(),preview:vi.fn(),save:vi.fn()}));
vi.mock('@/repositories/tenant-context',()=>({getTenantContext:context}));vi.mock('@/services/ovh-connection',()=>({canManageOvh:manage}));vi.mock('@/services/vsc-sms-audience',()=>({previewVscSmsAudience:preview,saveVscSmsAudience:save}));
import {GET,POST} from '@/app/api/admin/vsc-sms-audience/route';
const request=(body='{"reviewKey":"review","tenant":"foreign","contacts":["forged"]}',origin='https://fixture.invalid',type='application/json')=>new Request('https://fixture.invalid/api/admin/vsc-sms-audience',{method:'POST',headers:{origin,'content-type':type},body});
describe('SMS audience API',()=>{
 beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('VSC_OVH_TENANT_ID','vsc');context.mockResolvedValue({tenantId:'vsc',userId:'owner'});manage.mockReturnValue(true);preview.mockResolvedValue({sendingEnabled:false});save.mockResolvedValue({sendingEnabled:false});});afterEach(()=>vi.unstubAllEnvs());
 it('denies foreign origins and unauthorized accounts',async()=>{expect((await POST(request('{}','https://foreign.invalid'))).status).toBe(403);manage.mockReturnValue(false);expect((await GET()).status).toBe(403);expect((await POST(request())).status).toBe(403);expect(save).not.toHaveBeenCalled();expect(preview).not.toHaveBeenCalled();});
 it('uses only the session tenant, actor and review key',async()=>{const r=await POST(request());expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('no-store');expect(save).toHaveBeenCalledExactlyOnceWith('vsc','owner','review');});
 it('rejects malformed, oversized and unsupported bodies before saving',async()=>{expect((await POST(request('{'))).status).toBe(400);expect((await POST(request('x'.repeat(1001)))).status).toBe(413);expect((await POST(request('{}','https://fixture.invalid','text/plain'))).status).toBe(415);expect(save).not.toHaveBeenCalled();});
 it('masks errors without retry',async()=>{save.mockRejectedValue(new Error('private'));const r=await POST(request());expect(r.status).toBe(503);expect(await r.text()).not.toContain('private');expect(save).toHaveBeenCalledTimes(1);});
});
