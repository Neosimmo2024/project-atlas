import { NextResponse } from "next/server";
import {
  isAuthorizedRecruitmentOrchestrator,
  runRecruitmentEmailOrchestration
} from "@/services/recruitment-email-orchestrator";

export const runtime = "nodejs";

type StructuredError = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
};

function safeErrorDetail(error: unknown) {
  if (error instanceof Error) return { message: error.message };
  if (!error || typeof error !== "object") return { message: "Unknown orchestration error" };
  const structured = error as StructuredError;
  const stringValue = (value: unknown) => typeof value === "string" ? value.slice(0, 500) : undefined;
  return {
    code: stringValue(structured.code),
    message: stringValue(structured.message),
    details: stringValue(structured.details),
    hint: stringValue(structured.hint)
  };
}

export async function POST(request: Request) {
  if (!(await isAuthorizedRecruitmentOrchestrator(request))) {
    return NextResponse.json({ error: "Unauthorized orchestration request." }, { status: 401 });
  }

  try {
    const summary = await runRecruitmentEmailOrchestration();
    return NextResponse.json({ data: summary });
  } catch (error) {
    console.error("Recruitment email orchestration failed", error);
    return NextResponse.json(
      { error: "Recruitment email orchestration failed.", detail: safeErrorDetail(error) },
      { status: 500 }
    );
  }
}
