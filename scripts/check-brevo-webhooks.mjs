// Optional QA-only inspection. No writes, email sends, or inbound endpoint calls.
export async function checkBrevoWebhooks(env, request) {
  if (env.ATLAS_BREVO_WEBHOOK_CHECK !== "1") return { status: "SKIPPED" };
  if (env.VERCEL !== "1" || env.VERCEL_ENV !== "preview"
      || env.VERCEL_PROJECT_ID !== "prj_V0z2DwPzzhgWJxuv7iEEHWMG2yon"
      || env.VERCEL_GIT_COMMIT_REF !== "agent/v1-pilot-renato-stabilization-lot-9i") return { status: "SCOPE_REJECTED" };
  const key = env.BREVO_API_KEY?.trim();
  const domain = env.BREVO_RECRUITMENT_INBOUND_DOMAIN?.trim().toLowerCase();
  const secret = env.BREVO_INBOUND_WEBHOOK_SECRET?.trim();
  if (!key || !domain || !secret || secret.length < 32) return { status: "MISSING_CONFIGURATION" };
  try {
    const response = await request("https://api.brevo.com/v3/webhooks?type=inbound", {
      method: "GET", headers: { "api-key": key, accept: "application/json" },
      redirect: "error", signal: AbortSignal.timeout(10000)
    });
    if (response.status !== 200) {
      await response.body?.cancel();
      return { status: "HTTP_REJECTED", httpStatus: response.status };
    }
    const body = await response.json();
    if (!Array.isArray(body?.webhooks)) return { status: "INVALID_RESPONSE" };
    const matches = body.webhooks.filter(h => h?.type === "inbound" && typeof h.domain === "string" && h.domain.toLowerCase() === domain);
    return { status: "INSPECTED", inboundCount: body.webhooks.length, matchingDomainCount: matches.length,
      checks: matches.map(h => {
        let url;
        try { url = new URL(h.url); } catch { /* Report a boolean only. */ }
        return {
          expectedEvent: Array.isArray(h.events) && h.events.includes("inboundEmailProcessed"),
          expectedRoute: url?.pathname === "/api/internal/recruitment-email/inbound",
          pinnedValidatedHost: url?.hostname === "project-atlas-qa-beta-1-2kc3xe013-neos-immo.vercel.app",
          pilotBranchHost: url?.hostname === "project-atlas-qa-beta-1-git-agent-v1-pilot-ren-ca5108-neos-immo.vercel.app",
          fixedQaHost: url?.hostname === "project-atlas-qa-beta-1.vercel.app",
          cleanHttpsUrl: Boolean(url && url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash),
          matchingSecretHeader: Array.isArray(h.headers) && h.headers.some(v => typeof v?.key === "string" && v.key.toLowerCase() === "x-atlas-brevo-webhook-secret" && v.value === secret)
        };
      }) };
  } catch { return { status: "NETWORK_OR_INVALID_RESPONSE" }; }
}
