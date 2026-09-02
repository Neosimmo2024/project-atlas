import { NextResponse } from "next/server";

import { isAuthorizedRecruitmentOrchestrator } from "@/services/recruitment-email-orchestrator";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

type ActiveTemplate = {
  brevo_template_id: number | null;
  template_name: string;
  subject: string;
  sender_name: string;
  sender_email: string;
  reply_to: string | null;
  html_content: string;
};

export async function POST(request: Request) {
  if (!(await isAuthorizedRecruitmentOrchestrator(request))) {
    return NextResponse.json({ error: "Unauthorized resync request." }, { status: 401 });
  }

  const apiKey = process.env.BREVO_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "Brevo configuration missing." }, { status: 500 });

  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("recruitment_email_template_versions")
    .select("brevo_template_id,template_name,subject,sender_name,sender_email,reply_to,html_content")
    .eq("status", "active")
    .not("brevo_template_id", "is", null)
    .order("activated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: "Active template lookup failed.", code: error.code }, { status: 500 });
  const template = data as ActiveTemplate | null;
  const templateId = Number(template?.brevo_template_id);
  if (!template || !Number.isInteger(templateId) || templateId <= 0) {
    return NextResponse.json({ error: "No active Brevo template found." }, { status: 404 });
  }

  const response = await fetch(`https://api.brevo.com/v3/smtp/templates/${templateId}`, {
    method: "PUT",
    headers: {
      accept: "application/json",
      "api-key": apiKey,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      templateName: template.template_name,
      subject: template.subject,
      sender: { name: template.sender_name, email: template.sender_email },
      replyTo: template.reply_to || undefined,
      htmlContent: template.html_content,
      isActive: true
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { message?: string; code?: string };
    return NextResponse.json({ error: body.message || body.code || `Brevo HTTP ${response.status}` }, { status: 502 });
  }

  return NextResponse.json({ data: { templateId, synced: true } });
}
