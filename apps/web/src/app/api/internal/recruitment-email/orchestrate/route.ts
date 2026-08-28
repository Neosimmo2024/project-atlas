import { NextResponse } from "next/server";
import {
  isAuthorizedRecruitmentOrchestrator,
  runRecruitmentEmailOrchestration
} from "@/services/recruitment-email-orchestrator";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isAuthorizedRecruitmentOrchestrator(request)) {
    return NextResponse.json({ error: "Unauthorized orchestration request." }, { status: 401 });
  }

  try {
    const summary = await runRecruitmentEmailOrchestration();
    return NextResponse.json({ data: summary });
  } catch (error) {
    console.error("Recruitment email orchestration failed", error);
    return NextResponse.json({ error: "Recruitment email orchestration failed." }, { status: 500 });
  }
}
