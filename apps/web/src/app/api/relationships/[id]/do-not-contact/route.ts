import { NextResponse } from "next/server";
import { parseRecruitmentPipelineDoNotContact } from "@/features/recruitment-pipeline/validation";
import { apiErrorResponse } from "@/lib/security/api-errors";
import { getTenantContext } from "@/repositories/tenant-context";
import { setRelationshipDoNotContact } from "@/services/recruitment-pipeline-service";

type RouteContext = { params: Promise<{ id: string }> };

function validationErrorResponse(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  return NextResponse.json(
    { error: "Validation failed", fields: error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })) },
    { status: 400 }
  );
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const tenantContext = await getTenantContext();
    if (!tenantContext) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });

    const { id } = await context.params;
    const parsed = parseRecruitmentPipelineDoNotContact(await request.json());
    if (!parsed.success) return validationErrorResponse(parsed.error);

    const relationship = await setRelationshipDoNotContact(tenantContext, id, parsed.data);
    return NextResponse.json({ data: relationship });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
