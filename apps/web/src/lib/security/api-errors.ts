import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { ApiError, isApiError } from "@/lib/api-errors";
import { logServerError } from "@/lib/security/logger";

const DEFAULT_ERROR = "Une erreur est survenue.";

function postgresCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error ? String(error.code) : null;
}

function postgresMessage(error: unknown) {
  return typeof error === "object" && error !== null && "message" in error ? String(error.message) : "";
}

export function publicErrorMessage(error: unknown) {
  if (isApiError(error)) return error.message;
  if (error instanceof ZodError) return "Validation failed";
  if (error instanceof Error && error.message.startsWith("Suppression refusee")) return error.message;
  const code = postgresCode(error);
  const message = postgresMessage(error);
  if (code === "23505" && message.includes("relationships_active_identity_unique")) {
    return "Une relation active identique existe deja pour cette personne, cette organisation et ce type.";
  }
  if (code === "23505") return "Une ressource identique existe deja.";
  if (code === "23503") return "Une reference fournie est invalide.";
  if (code === "42501") return "Action non autorisee.";
  if (code === "42703" || code === "42P01") return "Configuration serveur invalide.";
  return DEFAULT_ERROR;
}

export function publicErrorStatus(error: unknown, fallback = 400) {
  if (isApiError(error)) return error.status;
  if (error instanceof ZodError) return 400;
  const code = postgresCode(error);
  if (code === "23505") return 409;
  if (code === "23503") return 400;
  if (code === "42501") return 403;
  if (code === "42703" || code === "42P01") return 500;
  return fallback;
}

export function publicErrorCode(error: unknown) {
  if (isApiError(error)) return error.code;
  if (error instanceof ZodError) return "VALIDATION_ERROR";
  const code = postgresCode(error);
  if (code === "23505") return "UNIQUE_VIOLATION";
  if (code === "23503") return "INVALID_REFERENCE";
  if (code === "42501") return "FORBIDDEN";
  if (code === "42703" || code === "42P01") return "SERVER_CONFIGURATION_ERROR";
  return "INTERNAL_ERROR";
}

export function apiErrorResponse(error: unknown, fallbackStatus = 400) {
  if (!(error instanceof ApiError)) {
    logServerError("API request failed", {
      name: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : String(error)
    });
  }

  return NextResponse.json(
    { error: publicErrorMessage(error), code: publicErrorCode(error) },
    { status: publicErrorStatus(error, fallbackStatus) }
  );
}
