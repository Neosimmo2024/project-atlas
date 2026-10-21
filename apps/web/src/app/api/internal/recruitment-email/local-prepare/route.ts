import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { isAuthorizedRecruitmentOrchestrator } from "@/services/recruitment-email-orchestrator";
import { prepareLocalEmailCampaign } from "@/services/local-email-campaign";
import { apiErrorResponse } from "@/lib/security/api-errors";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request) {
  if (!(await isAuthorizedRecruitmentOrchestrator(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { projectId } = z.object({ projectId: z.string().uuid() }).parse(await request.json());
    return NextResponse.json({ data: await prepareLocalEmailCampaign(createSupabaseServiceRoleClient(), projectId), emailsSent: 0, stepsScheduled: 0 });
  } catch (error) { return apiErrorResponse(error); }
}
