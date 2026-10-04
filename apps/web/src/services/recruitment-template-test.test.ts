import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_RECRUITMENT_EMAIL_TEMPLATE as template } from "@/features/recruitment-email-template/model";
import { sendRecruitmentTemplateTest } from "./recruitment-template-test";
import { POST } from "@/app/api/admin/recruitment-email-template/test/route";
import { getTenantContext } from "@/repositories/tenant-context";
vi.mock("@/repositories/tenant-context", () => ({ getTenantContext: vi.fn() }));
const input = { template, recipient: "test@example.com", firstName: "Renato <img src=x>", requestId: "e78bf5c7-ed34-4bc8-a542-5f768f294094" };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetAllMocks(); });
describe("isolated template test email", () => {
  it("sends exactly one recipient, escaped personalization, sender and reply-to without a saved template", async () => {
    vi.stubEnv("BREVO_API_KEY", "test-key");
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ messageId: "test-message" }), { status: 201 }));
    vi.stubGlobal("fetch", request);
    expect(await sendRecruitmentTemplateTest(input, "tenant-a")).toEqual({ success: true, messageId: "test-message" });
    expect(request).toHaveBeenCalledTimes(1);
    const [url, options] = request.mock.calls[0];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    const body = JSON.parse(options.body);
    expect(body.to).toEqual([{ email: input.recipient, name: input.firstName }]);
    expect(body.sender.email).toBe("contact@neos-immo.com");
    expect(body.replyTo.email).toBe("contact@neos-immo.com");
    expect(body.subject).toMatch(/^\[TEST\] Renato/);
    expect(body.htmlContent).toContain("Renato &lt;img src=x&gt;");
    expect(body.htmlContent).not.toContain("{{ params.PRENOM }}");
    expect(body).not.toHaveProperty("templateId");
    expect(body).not.toHaveProperty("scheduledAt");
    expect(body).not.toHaveProperty("bcc");
    expect(body.headers["Idempotency-Key"]).toContain("tenant-a");
  });
  it("does not send when configuration or placeholders are invalid", async () => {
    const request = vi.fn(); vi.stubGlobal("fetch", request);
    vi.stubEnv("BREVO_API_KEY", "");
    expect((await sendRecruitmentTemplateTest(input, "tenant-a")).success).toBe(false);
    vi.stubEnv("BREVO_API_KEY", "test-key");
    expect((await sendRecruitmentTemplateTest({ ...input, template: { ...template, subject: "Bonjour {{ville}}" } }, "tenant-a")).success).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });
  it("requires a provider message id and never automatically retries an ambiguous failure", async () => {
    vi.stubEnv("BREVO_API_KEY", "test-key");
    const request = vi.fn().mockRejectedValue(new Error("timeout")); vi.stubGlobal("fetch", request);
    expect((await sendRecruitmentTemplateTest(input, "tenant-a")).success).toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("requires an authenticated administrator before any delivery", async () => {
    const request = vi.fn(); vi.stubGlobal("fetch", request);
    vi.mocked(getTenantContext).mockResolvedValue(null);
    expect((await POST(new Request("https://atlas.test", { method: "POST", body: JSON.stringify(input) }))).status).toBe(401);
    vi.mocked(getTenantContext).mockResolvedValue({ role: "member", tenant: { id: "tenant-a" } } as never);
    expect((await POST(new Request("https://atlas.test", { method: "POST", body: JSON.stringify(input) }))).status).toBe(403);
    expect(request).not.toHaveBeenCalled();
  });
  it("rejects multiple recipients and malformed requests", async () => {
    const request = vi.fn(); vi.stubGlobal("fetch", request);
    vi.mocked(getTenantContext).mockResolvedValue({ role: "owner", tenant: { id: "tenant-a" } } as never);
    for (const body of ["{", JSON.stringify({ ...input, recipient: "one@example.com,two@example.com" })]) {
      expect((await POST(new Request("https://atlas.test", { method: "POST", body }))).status).toBe(400);
    }
    expect(request).not.toHaveBeenCalled();
  });
});
