import { describe, expect, it } from "vitest";
import { readResponseMessage } from "./response-message";

describe("readResponseMessage", () => {
  it("reads an error from a JSON response", async () => {
    const response = Response.json({ error: "Suppression refusee." }, { status: 403 });

    await expect(readResponseMessage(response, "Fallback")).resolves.toBe("Suppression refusee.");
  });

  it("reads a plain text response", async () => {
    const response = new Response("Suppression impossible.", { status: 400 });

    await expect(readResponseMessage(response, "Fallback")).resolves.toBe("Suppression impossible.");
  });

  it("uses the fallback for an empty response", async () => {
    const response = new Response(null, { status: 204 });

    await expect(readResponseMessage(response, "Fallback")).resolves.toBe("Fallback");
  });
});
