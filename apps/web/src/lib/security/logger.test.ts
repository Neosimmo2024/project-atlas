import { describe, expect, it } from "vitest";

import { redactValue } from "@/lib/security/logger";

describe("security logger redaction", () => {
  it("redacts secret-looking keys and Supabase key values", () => {
    const secretKey = "sb_" + "secret_" + "abcdefghijklmnopqrstuvwxyz";
    const publishableKey = "sb_" + "publishable_" + "abcdefghijklmnopqrstuvwxyz";

    expect(redactValue({
      apiKey: secretKey,
      nested: {
        authorization: "Bearer token",
        text: `public ${publishableKey}`
      }
    })).toEqual({
      apiKey: "[REDACTED]",
      nested: {
        authorization: "[REDACTED]",
        text: "public [REDACTED]"
      }
    });
  });

  it("redacts UUID values from log payloads", () => {
    expect(redactValue({ tenantId: "4ff4bbe5-1581-418c-9383-8fc0408e0b06" })).toEqual({
      tenantId: "[UUID]"
    });
  });
});
