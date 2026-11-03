import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const {from,rpc,identity}=vi.hoisted(()=>({from:vi.fn(),rpc:vi.fn(),identity:vi.fn()}));
vi.mock('@/lib/supabase/service-role',()=>({createSupabaseServiceRoleClient:()=>({from,rpc})}));
vi.mock('./vsc-brevo-sms-status',()=>({inspectVscBrevoSmsAccount:identity}));
import {normalizeVscHistoricalStats,reconcileVscBrevoHistoryBatch,getVscBrevoHistoryStatus} from './vsc-brevo-history';
const tenant='20000000-0000-0000-0000-000000000001',actor='10000000-0000-0000-0000-000000000001';
const fetchMock=vi.fn();
function query(data:unknown){return {select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),not:vi.fn().mockReturnThis(),is:vi.fn().mockReturnThis(),order:vi.fn().mockReturnThis(),limit:vi.fn().mockResolvedValue({data,error:null})};}
describe('VSC historical email reconciliation',()=>{
 beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('VSC_OVH_TENANT_ID',tenant);vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://mahgxumwucxehsooijag.supabase.co');vi.stubEnv('VERCEL_ENV','preview');vi.stubEnv('BREVO_VSC_API_KEY','synthetic-vsc');vi.stubGlobal('fetch',fetchMock);identity.mockResolvedValue({state:'identity_verified'});rpc.mockResolvedValue({data:1,error:null});});
 afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
 it('accepts only campaign 2 evidence and strips IPs, links and unrelated campaign events',()=>{
  const data=normalizeVscHistoricalStats({messagesSent:[{campaignId:2,eventTime:'2026-10-26T09:48:00Z',ip:'private'},{campaignId:3,eventTime:'bad'}],delivered:[{campaignId:2,eventTime:'2026-10-26T09:49:00Z'}],opened:[{url:'private'}]});expect(data).toEqual({sentAt:'2026-10-26T09:48:00.000Z',delivered:true,hardBounce:false,softBounce:false});expect(JSON.stringify(data)).not.toContain('private');
 });
 it('distinguishes absence of observed sends from a proof of non-send',()=>{expect(normalizeVscHistoricalStats({})).toMatchObject({sentAt:null});for(const value of [null,[],{messagesSent:{}},{messagesSent:[{campaignId:2,eventTime:'bad'}]}])expect(()=>normalizeVscHistoricalStats(value)).toThrow();});
 it('refuses foreign tenants, production and another provider account without SQL writes',async()=>{await expect(reconcileVscBrevoHistoryBatch(actor,actor)).rejects.toThrow();vi.stubEnv('VERCEL_ENV','production');await expect(reconcileVscBrevoHistoryBatch(tenant,actor)).rejects.toThrow();vi.stubEnv('VERCEL_ENV','preview');identity.mockResolvedValue({state:'identity_mismatch'});await expect(reconcileVscBrevoHistoryBatch(tenant,actor)).rejects.toThrow();expect(fetchMock).not.toHaveBeenCalled();expect(rpc).not.toHaveBeenCalled();});
 it('verifies campaign and contact identity with GET only, then records server-only evidence',async()=>{
  from.mockReturnValueOnce(query([{provider_id:1,person_id:actor,source_email:'shop@example.com'}])).mockReturnValueOnce(query([{history_campaign_2_checked_at:'now',history_campaign_2:{sentAt:'2026-10-26T09:48:00Z',hardBounce:true}}]));
  fetchMock.mockImplementation(async(url:string)=>({ok:true,json:async()=>url.includes('emailCampaigns')?{id:2,status:'sent',name:'VSC first',sender:{email:'contact@vendresoncommerce.com'},sentDate:'2026-10-26T09:48:00Z',recipients:{lists:[4]}}:{id:1,email:'shop@example.com',emailBlacklisted:true,statistics:{messagesSent:[{campaignId:2,eventTime:'2026-10-26T09:48:00Z'}],hardBounces:[{campaignId:2,eventTime:'2026-10-26T09:49:00Z'}]}}}));
  expect(await reconcileVscBrevoHistoryBatch(tenant,actor)).toMatchObject({processed:1,checked:1,sent:1,hardBounces:1,sendingEnabled:false});expect(rpc).toHaveBeenCalledWith('vsc_record_brevo_history',expect.objectContaining({p_tenant_id:tenant,p_actor_id:actor,p_entries:[expect.objectContaining({provider_id:1,emailBlocked:true,hardBounce:true})]}));for(const [url,options] of fetchMock.mock.calls){expect(url).toMatch(/^https:\/\/api.brevo.com\/v3\//);expect(options).toMatchObject({method:'GET',redirect:'error',cache:'no-store',headers:{'api-key':'synthetic-vsc'}});}
 });
 it('rejects changed campaign or malformed source before writing, never retries automatically',async()=>{fetchMock.mockResolvedValue({ok:true,json:async()=>({id:2,status:'draft'})});await expect(reconcileVscBrevoHistoryBatch(tenant,actor)).rejects.toThrow();expect(fetchMock).toHaveBeenCalledTimes(1);expect(rpc).not.toHaveBeenCalled();});
 it('summarizes pending and unknown observations without provider access or coordinates',async()=>{from.mockReturnValue(query([{history_campaign_2_checked_at:null},{history_campaign_2_checked_at:'now',history_campaign_2:{sentAt:null}}]));expect(await getVscBrevoHistoryStatus(tenant)).toMatchObject({total:2,checked:1,remaining:1,notObserved:1,sendingEnabled:false});expect(fetchMock).not.toHaveBeenCalled();});
});
