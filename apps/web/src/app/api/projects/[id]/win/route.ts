import { NextResponse } from "next/server";
import { parseProjectWinInput } from "@/features/projects/validation";
import { apiErrorResponse } from "@/lib/security/api-errors";
import { winProject } from "@/repositories/projects";
import { getTenantContext } from "@/repositories/tenant-context";

type ProjectRouteParams = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: ProjectRouteParams) {
  try {
    const context = await getTenantContext();
    if (!context) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });
    const parsed = parseProjectWinInput(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", fields: parsed.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })) }, { status: 400 });
    }
    const { id } = await params;
    const project = await winProject(context, id, parsed.data);
    return NextResponse.json({ data: project });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
