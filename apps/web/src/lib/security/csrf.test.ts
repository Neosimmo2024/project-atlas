import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { validateMutationRequest } from "@/lib/security/csrf";

function request(url: string, init: ConstructorParameters<typeof NextRequest>[1] = {}) {
  return new NextRequest(url, init);
}

describe("CSRF mutation protection", () => {
  it("allows safe API reads", () => {
    const response = validateMutationRequest(request("http://127.0.0.1:3000/api/people"));

    expect(response).toBeNull();
  });

  it("rejects cross-site browser mutations before route handlers", async () => {
    const response = validateMutationRequest(request("http://127.0.0.1:3000/api/people", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://evil.example",
        "sec-fetch-site": "cross-site"
      }
    }));

    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toMatchObject({ code: "CSRF_FORBIDDEN" });
  });

  it("rejects invalid content types for mutations", async () => {
    const response = validateMutationRequest(request("http://127.0.0.1:3000/api/people", {
      method: "POST",
      headers: {
        "content-type": "text/plain",
        origin: "http://127.0.0.1:3000",
        "sec-fetch-site": "same-origin"
      }
    }));

    expect(response?.status).toBe(415);
    await expect(response?.json()).resolves.toMatchObject({ code: "UNSUPPORTED_MEDIA_TYPE" });
  });

  it("allows configured same deployment origins", () => {
    vi.stubEnv("ATLAS_ALLOWED_ORIGINS", "https://atlas.example");

    const response = validateMutationRequest(request("http://internal-host/api/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://atlas.example",
        "sec-fetch-site": "same-site"
      }
    }));

    expect(response).toBeNull();
  });

  it("allows localhost and 127.0.0.1 as the same local development origin", () => {
    const response = validateMutationRequest(request("http://localhost:3000/api/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://127.0.0.1:3000",
        "sec-fetch-site": "same-origin"
      }
    }));

    expect(response).toBeNull();
  });
});
