import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const {context,manage,prepare}=vi.hoisted(()=>({context:vi.fn(),manage:vi.fn(),prepare:vi.fn()}));
vi.mock('@/repositories/tenant-context',()=>({getTenantContext:context}));vi.mock('@/services/ovh-connection',()=>({canManageOvh:manage}));vi.mock('@/services/vsc-technical-pilot',()=>({prepareVscTechnicalPilot:prepare}));
import {GET} from '@/app/api/admin/vsc-technical-pilot/route';
describe('private technical test preparation API',()=>{beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('VSC_OVH_TENANT_ID','vsc');context.mockResolvedValue({tenantId:'vsc',userId:'owner'});manage.mockReturnValue(true);prepare.mockResolvedValue({sendingEnabled:false,readOnly:true});});afterEach(()=>vi.unstubAllEnvs());
 it('requires administrator access before reading targets or verifying providers',async()=>{manage.mockReturnValue(false);expect((await GET()).status).toBe(403);expect(prepare).not.toHaveBeenCalled();});
 it('uses the server context and no-store response',async()=>{const r=await GET();expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('no-store');expect(context).toHaveBeenCalledExactlyOnceWith('vsc');expect(prepare).toHaveBeenCalledExactlyOnceWith({tenantId:'vsc',userId:'owner'});});
 it('sanitizes errors without disclosing private targets or credentials',async()=>{prepare.mockRejectedValue(new Error('private target and password'));const r=await GET();expect(r.status).toBe(503);expect(await r.text()).not.toContain('private target');});
});
