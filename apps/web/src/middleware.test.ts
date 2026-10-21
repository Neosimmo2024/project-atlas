import { NextRequest, NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { middleware } from "./middleware";
import { updateSession } from "@/lib/supabase/middleware";

vi.mock("@/lib/supabase/middleware", () => ({ updateSession: vi.fn() }));
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

describe("per-request script policy", () => {
  it("replaces attacker-supplied headers and forwards the same fresh nonce to renderer and browser", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.mocked(updateSession).mockImplementation(async (request) => NextResponse.next({ request }));
    const first = new NextRequest("https://atlas.example/login", { headers: { "x-nonce": "attacker", "content-security-policy": "script-src * 'unsafe-inline'" } });
    const response = await middleware(first);
    const policy = response.headers.get("content-security-policy")!;
    expect(policy).toBe(first.headers.get("content-security-policy"));
    expect(policy).toContain(`'nonce-${first.headers.get("x-nonce")}'`);
    expect(policy.split(";").find((value) => value.trim().startsWith("script-src"))).not.toMatch(/unsafe-inline|unsafe-eval|attacker/);
    expect(response.headers.get("x-middleware-request-content-security-policy")).toBe(policy);
    const second = await middleware(new NextRequest("https://atlas.example/login"));
    expect(second.headers.get("content-security-policy")).not.toBe(policy);
  });

  it.each([307, 403])("protects redirects and rejected mutations (%s)", async (status) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.mocked(updateSession).mockResolvedValue(new NextResponse(null, { status }));
    const result = await middleware(new NextRequest("https://atlas.example/dashboard"));
    expect(result.status).toBe(status);
    expect(result.headers.get("content-security-policy")).toContain("'nonce-");
  });
});
