import { NextResponse } from "next/server";
import { isAuthorizedRecruitmentOrchestrator } from "@/services/recruitment-email-orchestrator";
import { syncCalendlyStops } from "../../../../../../../../scripts/calendly-sms-stop.mjs";

export const runtime = "nodejs";
export const maxDuration = 60;

// Preparation endpoint only. No scheduler and no writes, including when a
// request body or environment variable asks for apply mode.
export async function POST(request: Request) {
  const env = process.env;
  if (env.VERCEL_ENV !== "preview"
      || env.VERCEL_PROJECT_ID !== "prj_V0z2DwPzzhgWJxuv7iEEHWMG2yon"
      || env.VERCEL_GIT_COMMIT_REF !== "agent/calendly-free-sms-stop-2026-09-30"
      || env.NEXT_PUBLIC_SUPABASE_URL !== "https://mahgxumwucxehsooijag.supabase.co") {
    return NextResponse.json({ error: "Unavailable" }, { status: 404 });
  }
  try {
    if (!(await isAuthorizedRecruitmentOrchestrator(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const deadline = AbortSignal.timeout(50000);
    const data = await syncCalendlyStops({
      token: env.CALENDLY_PERSONAL_ACCESS_TOKEN,
      brevoKey: env.BREVO_API_KEY,
      apply: false,
      transport: (url, options) => {
        if (options?.method !== "GET") throw Error("Read-only endpoint");
        return fetch(url, { ...options, signal: AbortSignal.any([
          deadline, ...(options.signal ? [options.signal] : [])
        ]) });
      }
    });
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Calendly verification failed" }, { status: 503 });
  }
}
