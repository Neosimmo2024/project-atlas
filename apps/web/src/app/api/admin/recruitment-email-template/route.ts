import { NextResponse } from "next/server";

import { buildRecruitmentEmailHtml, recruitmentEmailTemplateSchema } from "@/features/recruitment-email-template/model";
import { apiErrorResponse } from "@/lib/security/api-errors";
import {
  createRecruitmentEmailTemplateVersion,
  listRecruitmentEmailTemplateVersions
} from "@/repositories/recruitment-email-template-versions";
import { getTenantContext } from "@/repositories/tenant-context";

export async function GET() {
  try {
    const context = await getTenantContext();
    if (!context) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });
    if (context.role !== "owner" && context.role !== "admin") {
      return NextResponse.json({ error: "Action non autorisée." }, { status: 403 });
    }
    return NextResponse.json({ data: await listRecruitmentEmailTemplateVersions(context) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await getTenantContext();
    if (!context) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });
    if (context.role !== "owner" && context.role !== "admin") {
      return NextResponse.json({ error: "Action non autorisée." }, { status: 403 });
    }

    const parsed = recruitmentEmailTemplateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Les informations du modèle sont invalides.", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    const htmlContent = buildRecruitmentEmailHtml(parsed.data);
    const version = await createRecruitmentEmailTemplateVersion(context, parsed.data, htmlContent);
    return NextResponse.json({ data: version }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, 500);
  }
}
