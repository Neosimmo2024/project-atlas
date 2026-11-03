import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const {context,manage,inspect}=vi.hoisted(()=>({context:vi.fn(),manage:vi.fn(),inspect:vi.fn()}));vi.mock('@/repositories/tenant-context',()=>({getTenantContext:context}));vi.mock('@/services/ovh-connection',()=>({canManageOvh:manage}));vi.mock('@/services/vsc-personal-sms-receipt',()=>({inspectVscPersonalSmsReceipt:inspect}));
import {GET} from '@/app/api/admin/vsc-personal-sms-receipt/route';
describe('private personal SMS receipt API',()=>{beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('VSC_OVH_TENANT_ID','vsc');context.mockResolvedValue({tenantId:'vsc'});manage.mockReturnValue(true);inspect.mockResolvedValue({readOnly:true,delivery:'not_confirmed',events:[]});});afterEach(()=>vi.unstubAllEnvs());
 it('requires owner/admin and fixed server context',async()=>{manage.mockReturnValueOnce(false);expect((await GET()).status).toBe(403);expect(inspect).not.toHaveBeenCalled();expect((await GET()).headers.get('cache-control')).toBe('no-store');expect(inspect).toHaveBeenCalledExactlyOnceWith({tenantId:'vsc'});});
 it('does not expose provider failures or suggest a resend',async()=>{inspect.mockRejectedValue(new Error('private'));const r=await GET();expect(r.status).toBe(503);expect(await r.text()).not.toContain('private');});
});
