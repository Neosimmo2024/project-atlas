import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api-errors";
import { apiErrorResponse, publicErrorMessage } from "@/lib/security/api-errors";

describe("public API errors", () => {
  it("keeps known ApiError messages public", async () => {
    const response = apiErrorResponse(new ApiError("Action non autorisee.", 403, "FORBIDDEN"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Action non autorisee.", code: "FORBIDDEN" });
  });

  it("does not expose unexpected technical error messages", async () => {
    const error = new Error(`column ${"service_" + "role_" + "secret"} does not exist`);
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = apiErrorResponse(error);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Une erreur est survenue.", code: "INTERNAL_ERROR" });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("maps selected Postgres codes to stable public messages", () => {
    expect(publicErrorMessage({ code: "23505", message: "duplicate key value violates unique constraint" })).toBe("Une ressource identique existe deja.");
    expect(publicErrorMessage({ code: "42703", message: "column secret does not exist" })).toBe("Configuration serveur invalide.");
  });
});
