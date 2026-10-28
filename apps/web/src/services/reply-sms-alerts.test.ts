import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const db = vi.fn();
vi.mock("@/lib/supabase/service-role", () => ({ createSupabaseServiceRoleClient: () => db() }));
vi.mock("./brevo-account-binding", () => ({ verifyBrevoAccountBinding: vi.fn() }));
import { dispatchReplySmsAlerts, replySmsContent } from "./reply-sms-alerts";
describe("reply SMS alerts", () => {
  it("links directly to the authenticated person page without embedding email contents", () => {
    const content = replySmsContent("c936ee1c-4831-5059-9928-5c0b0bfefe33", "Éliane Bétemps");
    expect(content).toContain("Eliane Betemps");
    expect(content).toContain("/people/c936ee1c-4831-5059-9928-5c0b0bfefe33");
    expect(content.length).toBeLessThanOrEqual(160);
    expect(replySmsContent("c936ee1c-4831-5059-9928-5c0b0bfefe33", "Un nom particulierement long et composé").length).toBeLessThanOrEqual(160);
    expect(() => replySmsContent("../../external", "A")).toThrow();
  });
  it("does not access other tenants or send when disabled", async () => {
    await dispatchReplySmsAlerts("other");
    expect(db).not.toHaveBeenCalled();
    const rpc = vi.fn().mockResolvedValue({ data: "false", error: null });
    db.mockReturnValue({ rpc });
    await dispatchReplySmsAlerts("8e27b0ff-3f1a-41fa-8390-628c718723a2");
    expect(rpc).toHaveBeenCalledOnce();
  });
});
