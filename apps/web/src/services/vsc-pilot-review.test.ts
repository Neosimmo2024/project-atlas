import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const {from,collection,calendar}=vi.hoisted(()=>({from:vi.fn(),collection:vi.fn(),calendar:vi.fn()}));
vi.mock('@/lib/supabase/service-role',()=>({createSupabaseServiceRoleClient:()=>({from})}));
vi.mock('./vsc-collection-status',()=>({getVscCollectionStatus:collection}));
vi.mock('./vsc-sms-calendar',()=>({previewVscSmsCalendar:calendar}));
import {getVscPilotReview} from './vsc-pilot-review';
const tenant='20000000-0000-0000-0000-000000000001';
const campaignId='30000000-0000-0000-0000-000000000001';
const personId='40000000-0000-0000-0000-000000000001';
const campaign={id:campaignId,state:'draft',approved_at:null,enabled_at:null};
const delivery={campaign_id:campaignId,person_id:personId,channel:'email',step_key:'consideration',scheduled_at:'2026-11-15T08:30:00Z',status:'draft',provider_message_id:null,dispatch_started_at:null};
let tables:Record<string,{data:unknown[]|null;error:unknown}>;
const calls:Array<{table:string;tenant:string}>=[];
describe('VSC read-only pilot review',()=>{
 beforeEach(()=>{
  vi.resetAllMocks();vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-03T10:00:00Z'));
  vi.stubEnv('VSC_OVH_TENANT_ID',tenant);vi.stubEnv('VERCEL_ENV','preview');vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://mahgxumwucxehsooijag.supabase.co');calls.length=0;
  tables={vsc_campaigns:{data:[campaign],error:null},vsc_campaign_deliveries:{data:[delivery],error:null},vsc_sms_plan_reviews:{data:[{start_date:'2026-11-02',recipient_count:30,created_at:'2026-11-02T15:39:24Z'}],error:null}};
  from.mockImplementation((table:string)=>{const q={select:vi.fn(()=>q),eq:vi.fn((key:string,value:string)=>{calls.push({table,tenant:value});expect(key).toBe('tenant_id');return q;}),order:vi.fn(()=>q),limit:vi.fn(async()=>tables[table])};return q;});
  collection.mockResolvedValue({health:'healthy',runs:[{finishedAt:'2026-11-03T09:59:00Z'}]});
  calendar.mockResolvedValue({emailMobile:113,mobileOnly:30,overdueReminders:113,unknownHistory:0,startDate:'2026-11-03',mobileOnlySteps:[{date:'2026-11-03',promotional:true,providerDayAllowed:true,segments:2}]});
 });
 afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();});
 it('consolidates actual drafts and separates an expired saved plan from a new unsaved simulation',async()=>{
  const result=await getVscPilotReview(tenant);
  expect(result).toMatchObject({readOnly:true,sendingEnabled:false,campaigns:{total:1,approvedOrEnabled:0},emailGroups:[{drafts:1,recipients:1,lots:1,untouched:true,overdue:false}],sms:{overdueReminders:113,deliveries:0,savedPlan:{startDate:'2026-11-02',overdue:true},proposal:{startDate:'2026-11-03'}}});
  expect(calls).toHaveLength(3);expect(calls.every(c=>c.tenant===tenant)).toBe(true);
  expect(collection).toHaveBeenCalledExactlyOnceWith(tenant);expect(calendar).toHaveBeenCalledExactlyOnceWith(tenant);
  const json=JSON.stringify(result);for(const id of [tenant,campaignId,personId])expect(json).not.toContain(id);
 });
 it('does not mistake an attempted delivery, enabled campaign or unhealthy collection for untouched drafts',async()=>{
  tables.vsc_campaigns.data=[{...campaign,approved_at:'2026-11-02T10:00:00Z'}];
  tables.vsc_campaign_deliveries.data=[{...delivery,status:'sent',provider_message_id:'private-receipt',scheduled_at:'2026-11-01T08:30:00Z'}];
  collection.mockResolvedValue({health:'stale',runs:[]});
  const result=await getVscPilotReview(tenant);expect(result.campaigns.approvedOrEnabled).toBe(1);expect(result.emailGroups[0]).toMatchObject({drafts:0,untouched:false,overdue:true});expect(result.collection.health).toBe('stale');expect(JSON.stringify(result)).not.toContain('private-receipt');
 });
 it('refuses truncated, failed and inconsistent data instead of showing a partial launch review',async()=>{
  for(const bad of [{data:null,error:null},{data:Array(1001).fill(delivery),error:null},{data:[{...delivery,campaign_id:'foreign'}],error:null},{data:[],error:{message:'private error'}}]){
   tables.vsc_campaign_deliveries=bad;await expect(getVscPilotReview(tenant)).rejects.toThrow();
  }
 });
 it('rejects other tenants and production before any data access',async()=>{
  await expect(getVscPilotReview('foreign')).rejects.toThrow();vi.stubEnv('VERCEL_ENV','production');await expect(getVscPilotReview(tenant)).rejects.toThrow();expect(from).not.toHaveBeenCalled();expect(collection).not.toHaveBeenCalled();expect(calendar).not.toHaveBeenCalled();
 });
 it('uses the Paris date for expired drafts, including the UTC evening boundary',async()=>{
  vi.setSystemTime(new Date('2026-11-15T23:30:00Z'));const result=await getVscPilotReview(tenant);expect(result.today).toBe('2026-11-16');expect(result.emailGroups[0].overdue).toBe(true);
 });
});
