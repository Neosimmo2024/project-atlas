import { NextResponse } from "next/server";
import { parseRecruitmentPipelineTransition } from "@/features/recruitment-pipeline/validation";
import { getTenantContext } from "@/repositories/tenant-context";
import { RecruitmentPipelineError, transitionRecruitmentPipeline } from "@/services/recruitment-pipeline-service";

type RouteContext = { params: Promise<{ id: string }> };

function validationErrorResponse(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  return NextResponse.json(
    { error: "Validation failed", fields: error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })) },
    { status: 400 }
  );
}

function apiErrorResponse(error: unknown) {
  if (error instanceof RecruitmentPipelineError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Erreur inconnue.";
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const tenantContext = await getTenantContext();
    if (!tenantContext) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });

    const { id } = await context.params;
    const parsed = parseRecruitmentPipelineTransition(await request.json());
    if (!parsed.success) return validationErrorResponse(parsed.error);

    const relationship = await transitionRecruitmentPipeline(tenantContext, id, parsed.data);
    return NextResponse.json({ data: relationship });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
