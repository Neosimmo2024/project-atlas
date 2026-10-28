import {beforeEach,describe,it,expect,vi} from 'vitest';
import {inspectAuthorizedBrevoContactAttempt as inspect} from './brevo-contact-reconciliation';
const m=vi.hoisted(()=>({context:vi.fn(),client:vi.fn(),from:vi.fn(),select:vi.fn(),eq:vi.fn(),single:vi.fn(),source:vi.fn(),read:vi.fn()}));
vi.mock('./tenant-context',()=>({getTenantContext:m.context}));
vi.mock('@/lib/supabase/server',()=>({createSupabaseServerClient:m.client}));
vi.mock('./brevo-contact-source',()=>({createAuthorizedBrevoContactSource:m.source}));
const tenantId='11111111-1111-4111-8111-111111111111',personId='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333';
const actor={tenantId,userId:'user1',role:'owner'};
const transport=vi.fn<typeof fetch>();
const options={enabled:true,accountTenantId:tenantId,apiKey:'mock',transport};
beforeEach(()=>{
 vi.resetAllMocks();m.context.mockResolvedValue({...actor});const q={select:m.select,eq:m.eq,maybeSingle:m.single};m.client.mockResolvedValue({from:m.from});for(const fn of [m.from,m.select,m.eq])fn.mockReturnValue(q);
 m.single.mockResolvedValue({data:{id,tenant_id:tenantId,person_id:personId,status:'pending'},error:null});
 m.read.mockResolvedValue({tenantId,personId,email:'test@example.test',contactAllowed:true,doNotContact:false});m.source.mockResolvedValue({target:{tenantId,personId},readPerson:m.read});
 transport.mockImplementation(async()=>new Response(JSON.stringify({id:12,email:'test@example.test',emailBlacklisted:false,smsBlacklisted:false})));
});
describe('authorized contact reconciliation composition',()=>{
 it('does nothing when disabled',async()=>{expect((await inspect(id,{...options,enabled:false})).status).toBe('disabled');expect(m.context).not.toHaveBeenCalled();});
 it.each([null,{...actor,role:'reader'},{...actor,tenantId:personId}])('rejects unauthorized context %j',async ctx=>{m.context.mockResolvedValue(ctx);expect((await inspect(id,options)).status).toBe('unauthorized_attempt');expect(transport).not.toHaveBeenCalled();});
 it('connects source, tenant-filtered journal and GET observation',async()=>{expect(await inspect(id,options)).toEqual({status:'linked_contact_observed_review_required',retryAllowed:false});expect(m.eq).toHaveBeenCalledWith('tenant_id',tenantId);expect(m.eq).toHaveBeenCalledWith('id',id);expect(m.read).toHaveBeenCalledTimes(2);expect(transport).toHaveBeenCalledTimes(1);});
 it('rejects a missing journal',async()=>{m.single.mockResolvedValue({data:null,error:null});expect((await inspect(id,options)).status).toBe('unauthorized_attempt');expect(transport).not.toHaveBeenCalled();});
 it('does not expose database errors',async()=>{m.single.mockResolvedValue({data:null,error:{message:'private'}});expect(await inspect(id,options)).toEqual({status:'verification_failed',retryAllowed:false});expect(transport).not.toHaveBeenCalled();});
 it('fails when permissions change during the provider read',async()=>{transport.mockImplementation(async()=>{m.context.mockResolvedValue({...actor,role:'reader'});return new Response(JSON.stringify({id:12,email:'test@example.test',emailBlacklisted:false,smsBlacklisted:false}));});expect((await inspect(id,options)).status).toBe('verification_failed');});
 it('fails on a switched user',async()=>{m.context.mockResolvedValueOnce(actor).mockResolvedValue({...actor,userId:'other'});expect((await inspect(id,options)).status).toBe('verification_failed');expect(transport).not.toHaveBeenCalled();});
});
