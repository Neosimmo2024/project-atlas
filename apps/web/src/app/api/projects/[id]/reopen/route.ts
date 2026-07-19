import { NextResponse } from "next/server";
import { isApiError } from "@/lib/api-errors";
import { reopenProject } from "@/repositories/projects";
import { getTenantContext } from "@/repositories/tenant-context";

type ProjectRouteParams = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: ProjectRouteParams) {
  try {
    const context = await getTenantContext();
    if (!context) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });
    const { id } = await params;
    const project = await reopenProject(context, id);
    return NextResponse.json({ data: project });
  } catch (error) {
    if (isApiError(error)) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    const message = error instanceof Error ? error.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
