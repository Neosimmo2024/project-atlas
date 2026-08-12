import { afterEach, describe, expect, it, vi } from "vitest";
import { sendInitialRecruitmentEmail } from "@/services/brevo";

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
});
