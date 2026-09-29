import { isDeepStrictEqual } from "node:util";
const target = "https://project-atlas-qa-beta-1-2kc3xe013-neos-immo.vercel.app/api/internal/recruitment-email/inbound";
// Explicitly authorized URL-only maintenance. Off by default; never sends email.
export async function pinBrevoWebhook(env, request) {
  if (env.ATLAS_BREVO_WEBHOOK_PIN !== "f581d7e-approved") return { status: "SKIPPED" };
  if (env.VERCEL !== "1" || env.VERCEL_ENV !== "preview"
      || env.VERCEL_PROJECT_ID !== "prj_V0z2DwPzzhgWJxuv7iEEHWMG2yon"
      || env.VERCEL_GIT_COMMIT_REF !== "agent/v1-pilot-renato-stabilization-lot-9i") return { status: "SCOPE_REJECTED" };
  const key = env.BREVO_API_KEY?.trim();
  const domain = env.BREVO_RECRUITMENT_INBOUND_DOMAIN?.trim().toLowerCase();
  const secret = env.BREVO_INBOUND_WEBHOOK_SECRET?.trim();
  if (!key || !domain || !secret || secret.length < 32) return { status: "MISSING_CONFIGURATION" };
  let attempted = false;
  const call = (url, method = "GET", body) => request(url, {
    method, headers: { "api-key": key, accept: "application/json", ...(body ? {"content-type":"application/json"} : {}) },
    ...(body ? {body: JSON.stringify(body)} : {}), redirect: "error", signal: AbortSignal.timeout(10000)
  });
  try {
    const list = await call("https://api.brevo.com/v3/webhooks?type=inbound");
    if (list.status !== 200) { await list.body?.cancel(); return {status:"READ_REJECTED",httpStatus:list.status}; }
    const data = await list.json();
    if (!Array.isArray(data?.webhooks)) return {status:"INVALID_RESPONSE"};
    const matches = data.webhooks.filter(h => h?.type === "inbound" && typeof h.domain === "string" && h.domain.toLowerCase() === domain);
    if (matches.length !== 1) return {status:"AMBIGUOUS_MATCH"};
    const before = matches[0];
    const url = new URL(before.url);
    if (!Number.isSafeInteger(before.id) || before.id < 1
        || url.protocol !== "https:" || url.username || url.password || url.search || url.hash
        || url.pathname !== "/api/internal/recruitment-email/inbound"
        || !Array.isArray(before.events) || !before.events.includes("inboundEmailProcessed")
        || !Array.isArray(before.headers) || !before.headers.some(h => h?.key?.toLowerCase() === "x-atlas-brevo-webhook-secret" && h.value === secret))
      return {status:"PRECONDITION_REJECTED"};
    if (before.url === target) return {status:"ALREADY_PINNED",settingsPreserved:true};
    attempted = true;
    const update = await call("https://api.brevo.com/v3/webhooks/" + before.id, "PUT", {url:target});
    await update.body?.cancel();
    if (update.status !== 204) return {status:"UPDATE_NOT_CONFIRMED",httpStatus:update.status};
    const verify = await call("https://api.brevo.com/v3/webhooks?type=inbound");
    if (verify.status !== 200) {await verify.body?.cancel(); return {status:"VERIFICATION_REQUIRED"};}
    const afterList = await verify.json();
    const after = afterList?.webhooks?.find(h => h.id === before.id);
    const fields = ["id","type","domain","events","headers","auth","description","batched"];
    const preserved = !!after && fields.every(k => isDeepStrictEqual(before[k],after[k]));
    if (!after || after.url !== target || !preserved) return {status:"VERIFICATION_REQUIRED"};
    return {status:"UPDATED_VERIFIED",settingsPreserved:true,httpStatus:204};
  } catch { return {status:attempted ? "VERIFICATION_REQUIRED" : "READ_FAILED"}; }
}
