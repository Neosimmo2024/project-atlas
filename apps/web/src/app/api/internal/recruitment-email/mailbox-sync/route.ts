import { NextResponse } from "next/server";
import { isAuthorizedRecruitmentOrchestrator } from "@/services/recruitment-email-orchestrator";
import { syncConfiguredMailboxes } from "@/services/planet-mailbox";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request) {
  if (!(await isAuthorizedRecruitmentOrchestrator(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { await syncConfiguredMailboxes(); return NextResponse.json({ checked: true, sent: 0 }); }
  catch { return NextResponse.json({ error: "Mailbox check incomplete; follow-ups remain protected." }, { status: 503 }); }
}
