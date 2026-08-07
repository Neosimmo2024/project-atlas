import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { ApiError } from "@/lib/api-errors";
import { apiErrorResponse, publicErrorCode, publicErrorMessage } from "@/lib/security/api-errors";

describe("public API errors", () => {
  it("keeps known ApiError messages public", async () => {
    const response = apiErrorResponse(new ApiError("Action non autorisee.", 403, "FORBIDDEN"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Action non autorisee.", code: "FORBIDDEN" });
  });

  it("maps validation failures to a French public message", () => {
    const result = z.object({ title: z.string().min(1) }).safeParse({ title: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(publicErrorMessage(result.error)).toBe("Les informations saisies sont invalides.");
    }
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

  it.each(["PGRST204", "PGRST205"])("maps PostgREST schema error %s to a controlled server configuration error", async (code) => {
    const response = apiErrorResponse({
      code,
      message: "Could not find the 'vat_status' column of 'organizations' in the schema cache",
      details: "Searched for column public.organizations.vat_status",
      hint: "Reload the schema cache"
    });

    expect(response.status).toBe(500);
    expect(publicErrorCode({ code })).toBe("SERVER_CONFIGURATION_ERROR");
    await expect(response.json()).resolves.toEqual({
      error: "La configuration du service ne permet pas d'enregistrer cette organisation. Veuillez reessayer ulterieurement.",
      code: "SERVER_CONFIGURATION_ERROR"
    });
  });

  it("logs only safe technical Supabase fields for unexpected API failures", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    apiErrorResponse({
      name: "PostgrestError",
      code: "PGRST204",
      status: 400,
      message: "Could not find column vat_status",
      details: "Missing public.organizations.vat_status",
      hint: "Reload schema cache",
      password: "SecretPassword123",
      access_token: "token-value",
      cookie: "session-cookie",
      payload: { primary_email: "contact@reseau-test-atlas.example" }
    });

    expect(spy).toHaveBeenCalledWith("API request failed", {
      error: {
        name: "PostgrestError",
        code: "PGRST204",
        status: "400",
        message: "Could not find column vat_status",
        details: "Missing public.organizations.vat_status",
        hint: "Reload schema cache"
      }
    });
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).not.toContain("SecretPassword123");
    expect(logged).not.toContain("token-value");
    expect(logged).not.toContain("session-cookie");
    expect(logged).not.toContain("contact@reseau-test-atlas.example");
    spy.mockRestore();
  });

  it("keeps the relationship duplicate business message", () => {
    expect(publicErrorMessage({
      code: "23505",
      message: "duplicate key value violates unique constraint relationships_active_identity_unique"
    })).toBe("Une relation active identique existe deja pour cette personne, cette organisation et ce type.");
  });
});
