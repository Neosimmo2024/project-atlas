import { NextResponse } from "next/server";
import { parseProjectPatchInput } from "@/features/projects/validation";
import { isApiError } from "@/lib/api-errors";
import { getProjectDetail, patchProject } from "@/repositories/projects";
import { getTenantContext } from "@/repositories/tenant-context";

type ProjectRouteParams = { params: Promise<{ id: string }> };

function validationErrorResponse(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  return NextResponse.json(
    { error: "Validation failed", fields: error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })) },
    { status: 400 }
  );
}

function apiErrorResponse(error: unknown) {
  if (isApiError(error)) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  const message = error instanceof Error ? error.message : "Erreur inconnue.";
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : null;
  return NextResponse.json({ error: message, code }, { status: 400 });
}

export async function GET(_request: Request, { params }: ProjectRouteParams) {
  try {
    const context = await getTenantContext();
    if (!context) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });
    const { id } = await params;
    const detail = await getProjectDetail(context, id);
    if (!detail) return NextResponse.json({ error: "Projet introuvable" }, { status: 404 });
    return NextResponse.json({ data: detail });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: ProjectRouteParams) {
  try {
    const context = await getTenantContext();
    if (!context) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });
    const { id } = await params;
    const body = await request.json();
    const parsed = parseProjectPatchInput(body);
    if (!parsed.success) return validationErrorResponse(parsed.error);

    const project = await patchProject(context, id, parsed.data);
    return NextResponse.json({ data: project });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
