import { pathToFileURL } from "node:url";

// Opt-in read-only diagnostic. Never logs credentials or account response data.
export async function checkBrevoAccount(env, request) {
  if (env.ATLAS_BREVO_AUTH_CHECK !== "1") return "SKIPPED";
  if (env.VERCEL !== "1" || env.VERCEL_ENV !== "preview"
      || env.VERCEL_PROJECT_ID !== "prj_V0z2DwPzzhgWJxuv7iEEHWMG2yon"
      || env.VERCEL_GIT_COMMIT_REF !== "agent/v1-pilot-renato-stabilization-lot-9i") return "SCOPE_REJECTED";
  const key = env.BREVO_API_KEY?.trim();
  if (!key) return "MISSING_KEY";
  try {
    const response = await request("https://api.brevo.com/v3/account", {
      method: "GET",
      headers: { "api-key": key, accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(10000)
    });
    // Discard the body: account details are not needed to verify authentication.
    await response.body?.cancel();
    if (response.status === 200) return "ACCEPTED_HTTP_200";
    if (response.status === 401) return "REJECTED_HTTP_401";
    if (response.status === 403) return "FORBIDDEN_HTTP_403";
    if (response.status === 429) return "RATE_LIMITED_HTTP_429";
    return "UNEXPECTED_HTTP_STATUS";
  } catch {
    return "NETWORK_OR_TIMEOUT";
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await checkBrevoAccount(process.env, fetch);
  if (result !== "SKIPPED") console.log("BREVO_AUTH_CHECK " + result);
  if (!["SKIPPED", "ACCEPTED_HTTP_200"].includes(result)) process.exitCode = 1;
}
