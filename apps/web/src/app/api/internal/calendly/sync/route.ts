import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { isAuthorizedRecruitmentOrchestrator } from "@/services/recruitment-email-orchestrator";
import { syncCalendlyStops } from "../../../../../../../../scripts/calendly-sms-stop.mjs";

export const runtime = "nodejs";
export const maxDuration = 60;
const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status, headers: { "Cache-Control": "no-store" }
});

// This endpoint only ADDS existing contacts to the verified stop list. It cannot send.
// The database switch is off by default and cannot be changed through this route.
export async function POST(request: Request) {
  const env = process.env;
  if (env.VERCEL_ENV !== "preview"
      || env.VERCEL_PROJECT_ID !== "prj_V0z2DwPzzhgWJxuv7iEEHWMG2yon"
      || env.VERCEL_GIT_COMMIT_REF !== "agent/calendly-free-sms-stop-2026-09-30"
      || env.NEXT_PUBLIC_SUPABASE_URL !== "https://mahgxumwucxehsooijag.supabase.co") {
    return json({ error: "Unavailable" }, 404);
  }
  let lease: string | null = null;
  let db: ReturnType<typeof createSupabaseServiceRoleClient> | undefined;
  try {
    if (!(await isAuthorizedRecruitmentOrchestrator(request))) return json({ error: "Unauthorized" }, 401);
    db = createSupabaseServiceRoleClient();
    const claim = await db.rpc("claim_calendly_sms_stop_run");
    if (claim.error) throw Error("Lease unavailable");
    if (!claim.data) return json({ status: "disabled_or_busy" }, 409);
    lease = claim.data;
    const deadline = AbortSignal.timeout(45000);
    const data = await syncCalendlyStops({
      token: env.CALENDLY_PERSONAL_ACCESS_TOKEN,
      brevoKey: env.BREVO_API_KEY,
      apply: true,
      transport: (url, options) => {
        const target = String(url);
        if (options?.method !== "GET" && !(options?.method === "PUT"
            && /^https:\/\/api\.brevo\.com\/v3\/contacts\/[1-9][0-9]*\?identifierType=contact_id$/.test(target)
            && options.body === '{"listIds":[8]}')) throw Error("Unsupported operation");
        return fetch(url, { ...options, signal: AbortSignal.any([
          deadline, ...(options?.signal ? [options.signal] : [])
        ]) });
      }
    });
    const finish = await db.rpc("finish_calendly_sms_stop_run", { p_id: lease, p_success: true, p_summary: data });
    if (finish.error || finish.data !== true) throw Error("Journal unavailable");
    lease = null;
    return json({ data });
  } catch {
    if (lease && db) {
      try { await db.rpc("finish_calendly_sms_stop_run", { p_id: lease, p_success: false }); } catch { /* lease expires */ }
    }
    return json({ error: "Calendly stop synchronization failed" }, 503);
  }
}
