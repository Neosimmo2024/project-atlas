import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/types/domain";

const mocks = vi.hoisted(() => ({ context: vi.fn(), activeTemplate: vi.fn(), send: vi.fn() }));
vi.mock("@/repositories/tenant-context", () => ({ getTenantContext: mocks.context }));
vi.mock("@/repositories/recruitment-email-template-versions", () => ({ getActiveRecruitmentEmailTemplate: mocks.activeTemplate }));
vi.mock("@/services/brevo", () => ({ sendRecruitmentEmailTest: mocks.send }));

const context: TenantContext = { tenantId: "tenant-a", tenant: { id: "tenant-a", name: "NEOS IMMO" }, userId: "user-a", role: "owner" };
const template = { brevo_template_id: 14, sender_email: "renato.ponzio@neos-immo.com", reply_to: "renato.ponzio@neos-immo.com" };
const request = () => new Request("http://localhost/api/admin/recruitment-email-template/test-send", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ requestId: "11111111-1111-4111-8111-111111111111" })
});

describe("recruitment email template test-send API", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.context.mockResolvedValue(context);
    mocks.activeTemplate.mockResolvedValue(template);
    mocks.send.mockResolvedValue({ success: true, messageId: "brevo-test-1" });
  });

  it("sends only the active template through the isolated test service", async () => {
    const { POST } = await import("../../app/api/admin/recruitment-email-template/test-send/route");
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { messageId: "brevo-test-1", recipient: "renato.ponzio@neos-immo.com" } });
    expect(mocks.send).toHaveBeenCalledWith({
      templateId: 14,
      replyTo: "renato.ponzio@neos-immo.com",
      requestId: "11111111-1111-4111-8111-111111111111"
    });
  });

  it("blocks non-admin roles before sending", async () => {
    const { POST } = await import("../../app/api/admin/recruitment-email-template/test-send/route");
    mocks.context.mockResolvedValue({ ...context, role: "recruiter" });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("blocks when the active template has the wrong sender", async () => {
    const { POST } = await import("../../app/api/admin/recruitment-email-template/test-send/route");
    mocks.activeTemplate.mockResolvedValue({ ...template, sender_email: "other@example.com" });
    expect((await POST(request())).status).toBe(409);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("requires a synchronized active template", async () => {
    const { POST } = await import("../../app/api/admin/recruitment-email-template/test-send/route");
    mocks.activeTemplate.mockResolvedValue({ ...template, brevo_template_id: null });
    expect((await POST(request())).status).toBe(409);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
