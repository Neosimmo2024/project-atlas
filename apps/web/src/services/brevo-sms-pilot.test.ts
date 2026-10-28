import { describe, expect, it, vi } from "vitest";
import { sendBrevoSmsPilot } from "./brevo-sms-pilot";
import { SMS_PILOT_MESSAGE } from "@/features/recruitment-sms/pilot-preview";
function setup() {
  let claimed = false;
  const journal = {
    begin: vi.fn(async () => { if (claimed) throw Error("locked"); claimed = true; return "10000000-0000-4000-8000-000000000001"; }),
    finish: vi.fn(async () => {}),
  };
  return { enabled: true, recipient: "+33600000000", apiKey: "fake-key", journal,
    authorize: vi.fn(async () => {}), verifyAccount: vi.fn(async () => true),
    transport: vi.fn(async () => new Response(JSON.stringify({ messageId: 12345 }), { status: 201 })) };
}
describe("single personal SMS", () => {
  it("sends exactly once for concurrent attempts and never equates acceptance with delivery", async () => {
    const o = setup(); const results = await Promise.all([sendBrevoSmsPilot(o), sendBrevoSmsPilot(o)]);
    expect(results).toContainEqual({ status: "accepted", messageId: "12345" });
    expect(results).toContainEqual({ status: "locked_or_unavailable" });
    expect(o.transport).toHaveBeenCalledTimes(1);
    expect(o.transport).toHaveBeenCalledWith("https://api.brevo.com/v3/transactionalSMS/send", expect.objectContaining({ method: "POST", redirect: "error", cache: "no-store",
      body: JSON.stringify({ sender: "NEOSIMMO", recipient: "33600000000", content: SMS_PILOT_MESSAGE, type: "transactional", unicodeEnabled: false, tag: "atlas-sms-pilot-10000000-0000-4000-8000-000000000001" }) }));
  });
  it("does nothing when disabled", async () => { const o = setup(); o.enabled = false; expect(await sendBrevoSmsPilot(o)).toEqual({status:"disabled"}); expect(o.authorize).not.toHaveBeenCalled(); expect(o.transport).not.toHaveBeenCalled(); });
  it.each(["", "0600000000", "+33600000000,+33700000000"])("refuses unconfigured recipient %s", async recipient => { const o=setup(); o.recipient=recipient; expect((await sendBrevoSmsPilot(o)).status).toBe("unconfigured"); expect(o.journal.begin).not.toHaveBeenCalled(); });
  it("refuses another Brevo account before claiming", async () => { const o=setup(); o.verifyAccount.mockResolvedValue(false); expect((await sendBrevoSmsPilot(o)).status).toBe("account_unverified"); expect(o.journal.begin).not.toHaveBeenCalled(); });
  it("does not write without a durable claim", async () => { const o=setup(); o.journal.begin.mockRejectedValue(Error("db")); expect((await sendBrevoSmsPilot(o)).status).toBe("locked_or_unavailable"); expect(o.transport).not.toHaveBeenCalled(); });
  it("cancels when rights are revoked just before POST", async () => { const o=setup(); o.authorize.mockResolvedValueOnce().mockResolvedValueOnce().mockRejectedValue(Error("revoked")); expect((await sendBrevoSmsPilot(o)).status).toBe("cancelled"); expect(o.transport).not.toHaveBeenCalled(); expect(o.journal.finish).toHaveBeenCalledWith(expect.any(String),{status:"cancelled"}); });
  it("never retries an uncertain POST, even on a second click", async () => { const o=setup(); o.transport.mockRejectedValue(Error("timeout")); expect((await sendBrevoSmsPilot(o)).status).toBe("unknown"); expect((await sendBrevoSmsPilot(o)).status).toBe("locked_or_unavailable"); expect(o.transport).toHaveBeenCalledTimes(1); });
  it.each([400,401,403,429,500,200])( "handles HTTP %s without retry", async status => { const o=setup(); o.transport.mockResolvedValue(new Response("private provider error",{status})); expect((await sendBrevoSmsPilot(o)).status).toBe(status>=500||status===200?"unknown":"rejected"); expect(o.transport).toHaveBeenCalledTimes(1); });
  it.each([{}, {messageId:-1}, {messageId:9007199254740992}, {messageId:"bad"}])("rejects unverified acceptance %j", async body => { const o=setup(); o.transport.mockResolvedValue(new Response(JSON.stringify(body),{status:201})); expect((await sendBrevoSmsPilot(o)).status).toBe("unknown"); });
  it("does not claim success if journal completion fails",async()=>{const o=setup();o.journal.finish.mockRejectedValue(Error("db"));expect((await sendBrevoSmsPilot(o)).status).toBe("unknown");expect((await sendBrevoSmsPilot(o)).status).toBe("locked_or_unavailable");expect(o.transport).toHaveBeenCalledTimes(1);});
});
