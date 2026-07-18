import { NextResponse } from "next/server";
import { parseProjectArchiveInput } from "@/features/projects/validation";
import { archiveProject } from "@/repositories/projects";
import { getTenantContext } from "@/repositories/tenant-context";

type ProjectRouteParams = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: ProjectRouteParams) {
  try {
    const context = await getTenantContext();
    if (!context) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });
    const parsed = parseProjectArchiveInput(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", fields: parsed.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })) }, { status: 400 });
    }
    const { id } = await params;
    const project = await archiveProject(context, id, parsed.data);
    return NextResponse.json({ data: project });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
