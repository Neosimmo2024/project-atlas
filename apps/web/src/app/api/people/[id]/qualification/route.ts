import { NextResponse } from "next/server";
import { parseTalentQualification } from "@/features/talent-qualification/validation";
import { apiErrorResponse } from "@/lib/security/api-errors";
import { getTalentQualification, saveTalentQualification } from "@/repositories/talent-qualifications";
import { getTenantContext } from "@/repositories/tenant-context";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, route: RouteContext) {
  const context = await getTenantContext();
  if (!context) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });
  const { id } = await route.params;
  return NextResponse.json({ data: await getTalentQualification(context, id) });
}

export async function PUT(request: Request, route: RouteContext) {
  try {
    const context = await getTenantContext();
    if (!context) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });
    const body = await request.json();
    const parsed = parseTalentQualification(body);
    if (!parsed.success) {
      return NextResponse.json({
        error: "Les informations de qualification sont invalides.",
        fields: parsed.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message }))
      }, { status: 400 });
    }
    const { action, ...input } = parsed.data;
    const { id } = await route.params;
    const qualification = await saveTalentQualification(context, id, input, action === "finalize");
    return NextResponse.json({ data: qualification });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
