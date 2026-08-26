import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/security/api-errors";
import {
  activateRecruitmentEmailTemplateVersion,
  getRecruitmentEmailTemplateVersion,
  markRecruitmentEmailTemplateSyncError
} from "@/repositories/recruitment-email-template-versions";
import { getTenantContext } from "@/repositories/tenant-context";
import { createBrevoRecruitmentTemplate } from "@/services/brevo";

type RouteContext = { params: Promise<{ versionId: string }> };

export async function POST(_request: Request, route: RouteContext) {
  try {
    const context = await getTenantContext();
    if (!context) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });
    if (context.role !== "owner" && context.role !== "admin") {
      return NextResponse.json({ error: "Action non autorisée." }, { status: 403 });
    }

    const { versionId } = await route.params;
    const version = await getRecruitmentEmailTemplateVersion(context, versionId);
    if (!version) return NextResponse.json({ error: "Version introuvable." }, { status: 404 });
    if (version.status === "active" && version.brevo_template_id) {
      return NextResponse.json({ data: version, alreadyActive: true });
    }
    if (version.brevo_template_id) {
      const active = await activateRecruitmentEmailTemplateVersion(context, version.id, version.brevo_template_id);
      return NextResponse.json({ data: active, alreadySynced: true });
    }

    const result = await createBrevoRecruitmentTemplate({
      templateName: `${version.template_name} — v${version.version_number}`,
      subject: version.subject,
      senderName: version.sender_name,
      senderEmail: version.sender_email,
      replyTo: version.reply_to,
      htmlContent: version.html_content
    });

    if (!result.success) {
      const failed = await markRecruitmentEmailTemplateSyncError(context, version.id, result.error);
      return NextResponse.json({ error: result.error, data: failed }, { status: 502 });
    }

    const active = await activateRecruitmentEmailTemplateVersion(context, version.id, result.templateId);
    return NextResponse.json({ data: active });
  } catch (error) {
    return apiErrorResponse(error, 500);
  }
}
