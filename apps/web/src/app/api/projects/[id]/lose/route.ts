import { NextResponse } from "next/server";
import { parseProjectLoseInput } from "@/features/projects/validation";
import { isApiError } from "@/lib/api-errors";
import { getTenantContext } from "@/repositories/tenant-context";
import { loseProject } from "@/repositories/projects";

type ProjectRouteParams = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: ProjectRouteParams) {
  try {
    const context = await getTenantContext();
    if (!context) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });
    const parsed = parseProjectLoseInput(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", fields: parsed.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })) }, { status: 400 });
    }
    const { id } = await params;
    const project = await loseProject(context, id, parsed.data);
    return NextResponse.json({ data: project });
  } catch (error) {
    if (isApiError(error)) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    const message = error instanceof Error ? error.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
