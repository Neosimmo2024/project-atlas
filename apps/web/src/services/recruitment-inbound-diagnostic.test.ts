import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { collectInboundDiagnostic } from "./recruitment-inbound-diagnostic";
const now = Date.parse("2026-09-26T10:00:00Z");
beforeEach(() => {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("VERCEL_PROJECT_ID", "prj_V0z2DwPzzhgWJxuv7iEEHWMG2yon");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://mahgxumwucxehsooijag.supabase.co");
  vi.stubEnv("ATLAS_INBOUND_DIAGNOSTIC_SEQUENCE_ID", "pilot");
  vi.stubEnv("ATLAS_INBOUND_DIAGNOSTIC_UNTIL", "2026-09-26T10:30:00Z");
});
afterEach(() => vi.unstubAllEnvs());
describe("scoped inbound QA evidence", () => {
  it.each([
    ["VERCEL_ENV", "production"], ["VERCEL_ENV", "development"],
    ["VERCEL_PROJECT_ID", "other"], ["NEXT_PUBLIC_SUPABASE_URL", "https://production.supabase.co"],
    ["ATLAS_INBOUND_DIAGNOSTIC_SEQUENCE_ID", ""], ["ATLAS_INBOUND_DIAGNOSTIC_UNTIL", ""],
    ["ATLAS_INBOUND_DIAGNOSTIC_UNTIL", "2026-09-26T10:00:00Z"],
    ["ATLAS_INBOUND_DIAGNOSTIC_UNTIL", "2026-09-26T12:00:00Z"],
  ])("does not collect when %s is %s", (key, value) => {
    vi.stubEnv(key, value);
    expect(collectInboundDiagnostic("pilot", { "Authentication-Results": "dkim=pass" }, now)).toBeNull();
  });
  it("excludes other sequences", () => {
    expect(collectInboundDiagnostic("another", {}, now)).toBeNull();
  });
  it("keeps bounded evidence without treating a pass claim as trusted", () => {
    const data = collectInboundDiagnostic("pilot", {
      "Authentication-Results": ["forged; dkim=pass", "x".repeat(9000), "discard"],
      "AUTHENTICATION-RESULTS": "also discarded",
      "Received-SPF": "pass", Authorization: "secret", Cookie: "secret", Subject: "private",
      "ARC-Authentication-Results": { nested: "not a string" },
    }, now)!;
    expect(data.trust).toBe("unverified_email_headers");
    expect(data.headers).toEqual({
      "authentication-results": ["forged; dkim=pass", "x".repeat(2048)],
      "received-spf": ["pass"], "arc-authentication-results": [],
    });
    expect(JSON.stringify(data)).not.toContain("secret");
  });
  it.each([null, [], "bad", 42, {}])("records missing evidence without failing processing: %j", headers => {
    expect(collectInboundDiagnostic("pilot", headers, now)?.headers).toEqual({});
  });
});
