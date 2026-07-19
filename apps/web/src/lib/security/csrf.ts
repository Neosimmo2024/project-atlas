import { NextResponse, type NextRequest } from "next/server";

import { applySecurityHeaders } from "@/lib/security/headers";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const SAFE_FETCH_SITES = new Set(["same-origin", "same-site", "none"]);

export function isMutationMethod(method: string) {
  return MUTATION_METHODS.has(method.toUpperCase());
}

function configuredOrigins() {
  return new Set(
    (process.env.ATLAS_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  );
}

function requestOrigin(request: NextRequest) {
  return request.nextUrl.origin;
}

function isLoopbackHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

function isEquivalentLoopbackOrigin(origin: string, expectedOrigin: string) {
  try {
    const actual = new URL(origin);
    const expected = new URL(expectedOrigin);

    return actual.protocol === expected.protocol
      && actual.port === expected.port
      && isLoopbackHost(actual.hostname)
      && isLoopbackHost(expected.hostname);
  } catch {
    return false;
  }
}

function jsonError(status: number, code: string, error: string) {
  const response = NextResponse.json({ error, code }, { status });
  applySecurityHeaders(response.headers);
  return response;
}

export function validateMutationRequest(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api") || !isMutationMethod(request.method)) return null;

  const contentType = request.headers.get("content-type");
  if (contentType && !contentType.toLowerCase().includes("application/json")) {
    return jsonError(415, "UNSUPPORTED_MEDIA_TYPE", "Le format de la requete n'est pas pris en charge.");
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && !SAFE_FETCH_SITES.has(fetchSite)) {
    return jsonError(403, "CSRF_FORBIDDEN", "Requete refusee.");
  }

  const origin = request.headers.get("origin");
  if (!origin) return null;

  const allowedOrigins = configuredOrigins();
  const expectedOrigin = requestOrigin(request);
  if (origin === expectedOrigin || allowedOrigins.has(origin) || isEquivalentLoopbackOrigin(origin, expectedOrigin)) return null;

  return jsonError(403, "CSRF_FORBIDDEN", "Requete refusee.");
}
