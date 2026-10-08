import { afterEach,describe,expect,it,vi } from "vitest";
vi.mock("server-only",()=>({}));
import { sendLmdSingleEmail } from "./lmd-single-send";
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
const input={requestId:"campaign:B:person",recipient:"recipient@example.com",recipientName:"Recipient",subject:"Message validé",textContent:"Renato Ponzio\nPrésident — NEOS IMMO\n0661558750"};
describe("LMD provider confirmation",()=>{
 it("uses Renato sender and forwards the future schedule without marking delivery",async()=>{
 vi.stubEnv("BREVO_API_KEY","test-key");const fetcher=vi.fn().mockResolvedValue({ok:true,status:201,json:async()=>({messageId:"scheduled-id"})});vi.stubGlobal("fetch",fetcher);
 const result=await sendLmdSingleEmail({...input,scheduledAt:"2026-10-08T07:30:00.000Z"});
 expect(result).toEqual({success:true,messageId:"scheduled-id"});
 const payload=JSON.parse(fetcher.mock.calls[0][1].body);
 expect(payload.sender.email).toBe("renato.ponzio@neos-immo.com");expect(payload.replyTo.email).toBe(payload.sender.email);expect(payload.scheduledAt).toBe("2026-10-08T07:30:00.000Z");expect(payload.textContent).toBe(input.textContent);
 });
 it("never treats a missing provider id as confirmation",async()=>{vi.stubEnv("BREVO_API_KEY","test-key");vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,status:201,json:async()=>({})}));expect((await sendLmdSingleEmail(input)).success).toBe(false);});
 it("refuses TEST content before calling provider",async()=>{vi.stubEnv("BREVO_API_KEY","test-key");const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);expect((await sendLmdSingleEmail({...input,subject:"[TEST] Message"})).success).toBe(false);expect(fetcher).not.toHaveBeenCalled();});
 it("keeps a network timeout unconfirmed",async()=>{vi.stubEnv("BREVO_API_KEY","test-key");vi.stubGlobal("fetch",vi.fn().mockRejectedValue(new Error("timeout")));expect((await sendLmdSingleEmail(input)).success).toBe(false);});
});
