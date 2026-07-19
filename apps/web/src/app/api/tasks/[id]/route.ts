import { NextResponse } from "next/server";
import { parseTaskInput } from "@/features/tasks/validation";
import { apiErrorResponse } from "@/lib/security/api-errors";
import { deleteTask, updateTask } from "@/repositories/tasks";
import { getTenantContext } from "@/repositories/tenant-context";

type RouteContext = { params: Promise<{ id: string }> };

function validationErrorResponse(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  return NextResponse.json(
    { error: "Validation failed", fields: error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })) },
    { status: 400 }
  );
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const tenantContext = await getTenantContext();
    if (!tenantContext) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });

    const { id } = await context.params;
    const body = await request.json();
    const parsed = parseTaskInput(body);
    if (!parsed.success) return validationErrorResponse(parsed.error);

    const task = await updateTask(tenantContext, id, parsed.data);
    return NextResponse.json({ data: task });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const tenantContext = await getTenantContext();
    if (!tenantContext) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });

    const { id } = await context.params;
    const result = await deleteTask(tenantContext, id);
    if (!result.allowed) return NextResponse.json({ error: "Only owner and admin roles can delete tasks." }, { status: 403 });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
