import { createServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { isAuthPage, updateSession } from "./middleware";

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn()
}));

const createServerClientMock = vi.mocked(createServerClient);

function request(pathname: string) {
  return new NextRequest(`http://127.0.0.1:3000${pathname}`);
}

function mockUser(user: { id: string } | null) {
  createServerClientMock.mockReturnValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } })
    }
  } as unknown as ReturnType<typeof createServerClient>);
}

describe("Supabase middleware auth pages", () => {
  beforeEach(() => {
    createServerClientMock.mockReset();
  });

  it("treats password recovery pages as auth pages", () => {
    expect(isAuthPage("/login")).toBe(true);
    expect(isAuthPage("/forgot-password")).toBe(true);
    expect(isAuthPage("/update-password")).toBe(true);
    expect(isAuthPage("/dashboard")).toBe(false);
  });

  it("allows forgot-password and update-password without an authenticated user", async () => {
    mockUser(null);

    const forgotResponse = await updateSession(request("/forgot-password"));
    const updateResponse = await updateSession(request("/update-password?code=recovery-code"));

    expect(forgotResponse.status).toBe(200);
    expect(forgotResponse.headers.get("location")).toBeNull();
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.headers.get("location")).toBeNull();
  });

  it("keeps redirecting unauthenticated application pages to login", async () => {
    mockUser(null);

    const response = await updateSession(request("/dashboard"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/login");
  });

  it("keeps redirecting authenticated users away from login only", async () => {
    mockUser({ id: "user-a" });

    const loginResponse = await updateSession(request("/login"));
    const updateResponse = await updateSession(request("/update-password"));

    expect(loginResponse.status).toBe(307);
    expect(loginResponse.headers.get("location")).toBe("http://localhost:3000/dashboard");
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.headers.get("location")).toBeNull();
  });
});
