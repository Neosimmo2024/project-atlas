import { NextResponse } from "next/server";

import { isAuthorizedRecruitmentOrchestrator } from "@/services/recruitment-email-orchestrator";
import { bootstrapRecruitmentFollowUpTemplates } from "@/services/recruitment-follow-up-template-bootstrap";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await isAuthorizedRecruitmentOrchestrator(request))) {
    return NextResponse.json({ error: "Unauthorized bootstrap request." }, { status: 401 });
  }

  try {
    const templates = await bootstrapRecruitmentFollowUpTemplates();
    return NextResponse.json({ data: { templates, emailsSent: 0 } });
  } catch (error) {
    console.error("Recruitment follow-up template bootstrap failed", error);
    return NextResponse.json({ error: "Recruitment follow-up template bootstrap failed." }, { status: 500 });
  }
}
