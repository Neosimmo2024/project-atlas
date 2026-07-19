import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/security/api-errors";
import { reactivateProject } from "@/repositories/projects";
import { getTenantContext } from "@/repositories/tenant-context";

type ProjectRouteParams = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: ProjectRouteParams) {
  try {
    const context = await getTenantContext();
    if (!context) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });
    const { id } = await params;
    const project = await reactivateProject(context, id);
    return NextResponse.json({ data: project });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
