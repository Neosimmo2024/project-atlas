import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/service-role", () => ({
  createSupabaseServiceRoleClient: vi.fn(() => { throw new Error("Database access is forbidden in authentication tests"); })
}));

import { isAuthorizedBrevoInboundWebhook } from "./recruitment-inbound-replies";

const secret = "a".repeat(32);
const request = (value?: string) => new Request("https://atlas.test/inbound", {
  headers: value === undefined ? {} : { "x-atlas-brevo-webhook-secret": value }
});

afterEach(() => vi.unstubAllEnvs());

describe("Brevo inbound webhook authentication", () => {
  it("accepts the matching configured secret", () => {
    vi.stubEnv("BREVO_INBOUND_WEBHOOK_SECRET", secret);
    expect(isAuthorizedBrevoInboundWebhook(request(secret))).toBe(true);
  });
  it("rejects a missing configured secret", () => {
    vi.stubEnv("BREVO_INBOUND_WEBHOOK_SECRET", "");
    expect(isAuthorizedBrevoInboundWebhook(request(secret))).toBe(false);
  });
  it("rejects a configured secret shorter than 32 characters", () => {
    vi.stubEnv("BREVO_INBOUND_WEBHOOK_SECRET", "short");
    expect(isAuthorizedBrevoInboundWebhook(request("short"))).toBe(false);
  });
  it("rejects a missing header", () => {
    vi.stubEnv("BREVO_INBOUND_WEBHOOK_SECRET", secret);
    expect(isAuthorizedBrevoInboundWebhook(request())).toBe(false);
  });
  it("rejects an incorrect secret of the same length", () => {
    vi.stubEnv("BREVO_INBOUND_WEBHOOK_SECRET", secret);
    expect(isAuthorizedBrevoInboundWebhook(request("b".repeat(32)))).toBe(false);
  });
  it("rejects a secret of a different length", () => {
    vi.stubEnv("BREVO_INBOUND_WEBHOOK_SECRET", secret);
    expect(isAuthorizedBrevoInboundWebhook(request("b".repeat(33)))).toBe(false);
  });
  it("rejects unequal UTF-8 byte lengths without throwing", () => {
    vi.stubEnv("BREVO_INBOUND_WEBHOOK_SECRET", secret);
    expect(isAuthorizedBrevoInboundWebhook(request("é".repeat(32)))).toBe(false);
  });
});
