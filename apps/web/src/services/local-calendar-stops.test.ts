import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getLocalBookedEmails, syncLocalCalendarStops } from "./local-calendar-stops";
const request=vi.fn();
const user="https://api.calendly.com/users/renato";
const eventType="https://api.calendly.com/event_types/recruitment";
const page=(collection: unknown[])=>({ collection,pagination: { next_page_token: null } });
function response(body: unknown,ok=true) { return { ok,json: async()=>body }; }
function provider() {
  request.mockImplementation(async (url: string)=> {
    const path=new URL(url).pathname;
    if (path==="/users/me") return response({ resource: { email: "renato.ponzio@neos-immo.com",uri: user } });
    if (path==="/event_types") return response(page([{ uri: eventType,scheduling_url: "https://calendly.com/renato-ponzio/30min" }]));
    if (path==="/scheduled_events") return response(page([
      { uri: "https://api.calendly.com/scheduled_events/one",event_type: eventType,status: "active" },
      { uri: "https://api.calendly.com/scheduled_events/two",event_type: eventType,status: "canceled" },
      { uri: "https://api.calendly.com/scheduled_events/other",event_type: "other" }
    ]));
    return response(page([{ email: path.includes("/one/") ? " CANDIDATE@example.test " : "cancelled@example.test" }]));
  });
}
beforeEach(()=>{ vi.resetAllMocks(); vi.stubEnv("CALENDLY_PERSONAL_ACCESS_TOKEN","unit-test-token"); vi.stubGlobal("fetch",request); provider(); });
afterEach(()=>{ vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("Calendly stop guard for local emails",()=>{
  it("matches the exact recruitment event and retains cancelled bookings as stops",async()=>{
    expect(await getLocalBookedEmails()).toEqual(new Set(["candidate@example.test","cancelled@example.test"]));
    expect(request).toHaveBeenCalledTimes(5);
    expect(request.mock.calls.every(([url])=>new URL(url).origin==="https://api.calendly.com")).toBe(true);
  });
  it("rejects a different account before reading its appointments",async()=>{
    request.mockResolvedValue(response({ resource: { email: "other@example.test",uri: user } }));
    await expect(getLocalBookedEmails()).rejects.toThrow("account mismatch");
    expect(request).toHaveBeenCalledTimes(1);
  });
  function database(rows: unknown[]) {
    const writes: unknown[]=[];
    const from=vi.fn((table: string)=>{
      let changed=false;
      const query={ select: vi.fn().mockReturnThis(),contains: vi.fn().mockReturnThis(),in: vi.fn().mockReturnThis(),neq: vi.fn().mockReturnThis(),eq: vi.fn().mockReturnThis(),
        update: vi.fn((value: unknown)=>{ changed=true;writes.push(value);return query; }),upsert: vi.fn((value: unknown)=>{writes.push(value);return query;}),
        then: (resolve: (value: unknown)=>unknown)=>Promise.resolve({ data: table==="timeline_events" ? null : changed ? [{ id: "sequence" }] : rows,error: null }).then(resolve) };
      return query;
    });
    return { db: { from } as unknown as SupabaseClient,writes };
  }
  it("stops only the exact booked mailbox and records the reason",async()=>{
    const { db,writes }=database([{id:"one",tenant_id:"tenant",person_id:"person",email:"candidate@example.test"},{id:"two",email:"unrelated@example.test"}]);
    expect(await syncLocalCalendarStops(db)).toEqual({stopped:1,verified:true});
    expect(writes[0]).toMatchObject({status:"stopped",lifecycle_status:"stopped",stop_reason:"appointment",next_action_at:null});
    expect(writes).toHaveLength(2);
  });
  it("blocks local sends if Calendly cannot be verified",async()=>{
    request.mockResolvedValue(response({},false));
    const { db,writes }=database([{id:"one",email:"candidate@example.test"}]);
    expect(await syncLocalCalendarStops(db)).toEqual({stopped:0,verified:false});
    expect(writes).toEqual([]);
  });
  it("does not query Calendly when no active local sequence exists",async()=>{
    expect(await syncLocalCalendarStops(database([]).db)).toEqual({stopped:0,verified:true});
    expect(request).not.toHaveBeenCalled();
  });
});
