import { logServerError } from "@/lib/security/logger";
import { syncConfiguredMailboxes } from "@/services/planet-mailbox";
import { NextResponse } from "next/server";
import {
  isAuthorizedRecruitmentOrchestrator,
  runRecruitmentEmailOrchestration
} from "@/services/recruitment-email-orchestrator";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  if (!(await isAuthorizedRecruitmentOrchestrator(request))) {
    return NextResponse.json({ error: "Unauthorized orchestration request." }, { status: 401 });
  }

  try {
    await syncConfiguredMailboxes();
    const summary = await runRecruitmentEmailOrchestration({ prepareLimit: 500, claimLimit: 50 });
    return NextResponse.json({ data: summary });
  } catch {
    logServerError("Recruitment email orchestration failed");
    return NextResponse.json({ error: "Recruitment email orchestration failed." }, { status: 500 });
  }
}

