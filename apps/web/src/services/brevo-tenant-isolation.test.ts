import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NEOS_TENANT_ID, VSC_TENANT_ID } from "@/lib/brevo-tenants";
import { createBrevoRecruitmentTemplate, sendInitialRecruitmentEmail, sendRecruitmentFollowUpEmail, verifyBrevoSender, verifyBrevoTemplate } from "./brevo";
const mocks = vi.hoisted(() => ({ db: vi.fn() }));
vi.mock("@/lib/supabase/service-role", () => ({ createSupabaseServiceRoleClient: mocks.db }));
const transport = vi.fn();
const template = { templateName: "Fixture", subject: "Fixture", senderName: "NEOS", senderEmail: "contact@neos-immo.com", htmlContent: "Fixture" };
beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal("fetch", transport);
  vi.stubEnv("BREVO_API_KEY", "neos-fixture"); vi.stubEnv("BREVO_VSC_API_KEY", "vsc-fixture");
  vi.stubEnv("BREVO_INITIAL_RECRUITMENT_TEMPLATE_ID", "42");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("NEOS operations fail closed for other tenants", () => {
  for (const tenantId of [VSC_TENANT_ID, "unknown", "", undefined as unknown as string]) {
    it(`blocks email, follow-ups, templates and provider reads for ${tenantId}`, async () => {
      expect((await sendInitialRecruitmentEmail({ tenantId, sequenceId: "seq", email: "fixture@example.com", displayName: "Fixture" })).success).toBe(false);
      for (const templateId of [undefined, 42]) {
        expect((await sendRecruitmentFollowUpEmail({ tenantId, stepId: "step", stepIndex: 1, templateId, email: "fixture@example.com", displayName: "Fixture" })).success).toBe(false);
      }
      expect((await createBrevoRecruitmentTemplate(tenantId, template)).success).toBe(false);
      await expect(verifyBrevoSender(tenantId, template.senderEmail)).rejects.toThrow();
      await expect(verifyBrevoTemplate(tenantId, 42, { subject: "Fixture", sender_email: template.senderEmail, reply_to: null, html_content: "Fixture" })).rejects.toThrow();
      expect(transport).not.toHaveBeenCalled(); expect(mocks.db).not.toHaveBeenCalled();
    });
  }
  it("never substitutes the VSC key when the NEOS key is missing", async () => {
    vi.stubEnv("BREVO_API_KEY", "");
    expect((await sendInitialRecruitmentEmail({ tenantId: NEOS_TENANT_ID, sequenceId: "seq", email: "fixture@example.com", displayName: "Fixture" })).success).toBe(false);
    expect(transport).not.toHaveBeenCalled();
  });
  it("preserves NEOS follow-ups with an explicit template and its own credential", async () => {
    vi.stubEnv("BREVO_RECRUITMENT_INBOUND_DOMAIN", "");
    transport.mockResolvedValue(new Response(JSON.stringify({ messageId: "fixture-id" }), { status: 201 }));
    expect((await sendRecruitmentFollowUpEmail({ tenantId: NEOS_TENANT_ID, stepId: "step", stepIndex: 1, templateId: 42, email: "fixture@example.com", displayName: "Fixture" })).success).toBe(true);
    expect(transport).toHaveBeenCalledWith("https://api.brevo.com/v3/smtp/email", expect.objectContaining({ headers: expect.objectContaining({ "api-key": "neos-fixture" }) }));
  });
});
