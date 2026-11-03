import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const {context,manage,status}=vi.hoisted(()=>({context:vi.fn(),manage:vi.fn(),status:vi.fn()}));vi.mock('@/repositories/tenant-context',()=>({getTenantContext:context}));vi.mock('@/services/ovh-connection',()=>({canManageOvh:manage}));vi.mock('@/services/vsc-collection-status',()=>({getVscCollectionStatus:status}));
import {GET} from '@/app/api/admin/vsc-collection-status/route';
describe('VSC private collection status API',()=>{beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('VSC_OVH_TENANT_ID','vsc');context.mockResolvedValue({tenantId:'vsc',userId:'owner'});manage.mockReturnValue(true);status.mockResolvedValue({sendingEnabled:false});});afterEach(()=>vi.unstubAllEnvs());
 it('requires an active VSC administrator',async()=>{manage.mockReturnValue(false);expect((await GET()).status).toBe(403);expect(status).not.toHaveBeenCalled();});
 it('uses the server tenant and does not cache the operational status',async()=>{const r=await GET();expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('no-store');expect(status).toHaveBeenCalledExactlyOnceWith('vsc');});
 it('sanitizes internal failures',async()=>{status.mockRejectedValue(new Error('private'));const r=await GET();expect(r.status).toBe(503);expect(await r.text()).not.toContain('private');});
});
