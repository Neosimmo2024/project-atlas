import { describe, expect, it, vi } from "vitest";

import { buildContentSecurityPolicy, buildSecurityHeaders } from "@/lib/security/headers";

describe("security headers", () => {
  it("builds a restrictive CSP including the configured Supabase origin", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "");

    const csp = buildContentSecurityPolicy();

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("connect-src 'self' https://example.supabase.co");
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it("only enables HSTS for an explicit production HTTPS context", () => {
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("ATLAS_ENABLE_HSTS", "");

    expect(buildSecurityHeaders().some((header) => header.key === "Strict-Transport-Security")).toBe(false);

    vi.stubEnv("VERCEL_ENV", "production");

    expect(buildSecurityHeaders()).toContainEqual({
      key: "Strict-Transport-Security",
      value: "max-age=31536000; includeSubDomains"
    });
  });
});
