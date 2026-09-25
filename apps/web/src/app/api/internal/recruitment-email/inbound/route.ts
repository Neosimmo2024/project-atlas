import { logServerError } from "@/lib/security/logger";
import { NextResponse } from "next/server";
import {
  isAuthorizedBrevoInboundWebhook,
  processBrevoInboundReplies,
  type BrevoInboundPayload
} from "@/services/recruitment-inbound-replies";

export async function POST(request: Request) {
  if (!isAuthorizedBrevoInboundWebhook(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: BrevoInboundPayload;
  try {
    payload = await request.json() as BrevoInboundPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  try {
    return NextResponse.json({ data: await processBrevoInboundReplies(payload) });
  } catch {
    logServerError("Brevo inbound reply processing failed");
    return NextResponse.json({ error: "Inbound reply processing failed" }, { status: 500 });
  }
}

