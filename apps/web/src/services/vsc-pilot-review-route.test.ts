import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const {context,manage,review}=vi.hoisted(()=>({context:vi.fn(),manage:vi.fn(),review:vi.fn()}));
vi.mock('@/repositories/tenant-context',()=>({getTenantContext:context}));
vi.mock('@/services/ovh-connection',()=>({canManageOvh:manage}));
vi.mock('@/services/vsc-pilot-review',()=>({getVscPilotReview:review}));
import {GET} from '@/app/api/admin/vsc-pilot-review/route';
describe('VSC pilot review API',()=>{
 beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('VSC_OVH_TENANT_ID','vsc');context.mockResolvedValue({tenantId:'vsc'});manage.mockReturnValue(true);review.mockResolvedValue({readOnly:true,sendingEnabled:false});});
 afterEach(()=>vi.unstubAllEnvs());
 it('requires an active owner/admin before reading any pilot data',async()=>{manage.mockReturnValue(false);expect((await GET()).status).toBe(403);expect(review).not.toHaveBeenCalled();});
 it('uses the fixed server tenant and disables caching',async()=>{const response=await GET();expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');expect(review).toHaveBeenCalledExactlyOnceWith('vsc');});
 it('does not expose provider or database errors',async()=>{review.mockRejectedValue(new Error('private details'));const response=await GET();expect(response.status).toBe(503);expect(await response.text()).not.toContain('private details');});
});
