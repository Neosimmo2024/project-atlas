import { afterEach, describe, expect, it, vi } from "vitest";
import { createBrevoRecruitmentTemplate, sendInitialRecruitmentEmail, sendRecruitmentEmailTest } from "@/services/brevo";

describe("Brevo initial recruitment email", () => {
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.BREVO_API_KEY; delete process.env.BREVO_INITIAL_RECRUITMENT_TEMPLATE_ID; });

  it("fails clearly when server configuration is missing", async () => {
    expect(await sendInitialRecruitmentEmail({ sequenceId: "seq", email: "a@example.fr", displayName: "Alice" }))
      .toEqual({ success: false, error: "Configuration Brevo incomplète." });
  });

  it("uses a server key, a template and a stable idempotency key", async () => {
    process.env.BREVO_API_KEY = "secret";
    process.env.BREVO_INITIAL_RECRUITMENT_TEMPLATE_ID = "42";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ messageId: "message-1" }), { status: 201, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendInitialRecruitmentEmail({ sequenceId: "sequence-a", email: "alice@example.fr", displayName: "Alice Martin" }))
      .toEqual({ success: true, messageId: "message-1" });
    expect(fetchMock).toHaveBeenCalledWith("https://api.brevo.com/v3/smtp/email", expect.objectContaining({
      headers: expect.objectContaining({ "api-key": "secret" }),
      body: expect.stringContaining('"Idempotency-Key":"sequence-a"')
    }));
  });

  it("prefers the active tenant template over the legacy environment template", async () => {
    process.env.BREVO_API_KEY = "secret";
    process.env.BREVO_INITIAL_RECRUITMENT_TEMPLATE_ID = "42";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ messageId: "message-2" }), { status: 201, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await sendInitialRecruitmentEmail({ sequenceId: "sequence-b", email: "alice@example.fr", displayName: "Alice Martin", templateId: 88 });
    const options = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(options.body))).toMatchObject({ templateId: 88 });
  });

  it("sends an isolated template test only to Renato with the expected personalization", async () => {
    process.env.BREVO_API_KEY = "secret";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ messageId: "test-message-1" }), { status: 201, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await sendRecruitmentEmailTest({ templateId: 14, replyTo: "renato.ponzio@neos-immo.com", requestId: "11111111-1111-4111-8111-111111111111" });
    expect(result).toEqual({ success: true, messageId: "test-message-1" });
    const options = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(options.body))).toMatchObject({
      templateId: 14,
      to: [{ email: "renato.ponzio@neos-immo.com", name: "Renato Ponzio" }],
      params: { PRENOM: "Renato" },
      replyTo: { email: "renato.ponzio@neos-immo.com", name: "NEOS IMMO" },
      headers: { "Idempotency-Key": "atlas-recruitment-template-test:11111111-1111-4111-8111-111111111111" }
    });
  });

  it("creates and activates a Brevo template without calling the email endpoint", async () => {
    process.env.BREVO_API_KEY = "secret";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 91 }), { status: 201, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await createBrevoRecruitmentTemplate({
      templateName: "Premier email v1",
      subject: "Bonjour {{ params.PRENOM }}",
      senderName: "NEOS IMMO",
      senderEmail: "contact@neos-immo.com",
      replyTo: "contact@neos-immo.com",
      htmlContent: "<html><body>Bonjour {{ params.PRENOM }}</body></html>"
    });
    expect(result).toEqual({ success: true, templateId: 91 });
    expect(fetchMock).toHaveBeenCalledWith("https://api.brevo.com/v3/smtp/templates", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).not.toHaveBeenCalledWith("https://api.brevo.com/v3/smtp/email", expect.anything());
    const options = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(options.body))).toMatchObject({ isActive: true, tag: "avenor-initial-recruitment" });
  });
});
