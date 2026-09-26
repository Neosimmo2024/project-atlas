import { logServerError } from "@/lib/security/logger";
import { NextResponse } from "next/server";
import {
  isAuthorizedRecruitmentOrchestrator,
  runRecruitmentEmailOrchestration
} from "@/services/recruitment-email-orchestrator";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await isAuthorizedRecruitmentOrchestrator(request))) {
    return NextResponse.json({ error: "Unauthorized orchestration request." }, { status: 401 });
  }

  try {
    const summary = await runRecruitmentEmailOrchestration();
    return NextResponse.json({ data: summary });
  } catch {
    logServerError("Recruitment email orchestration failed");
    return NextResponse.json({ error: "Recruitment email orchestration failed." }, { status: 500 });
  }
}

