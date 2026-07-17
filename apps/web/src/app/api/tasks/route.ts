import { NextResponse } from "next/server";
import { parseTaskInput } from "@/features/tasks/validation";
import { createTask, listTasks } from "@/repositories/tasks";
import { getTenantContext } from "@/repositories/tenant-context";

function validationErrorResponse(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  return NextResponse.json(
    { error: "Validation failed", fields: error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })) },
    { status: 400 }
  );
}

function apiErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Erreur inconnue.";
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : null;
  const isMissingColumn = code === "42703" || message.includes("does not exist") || message.includes("relation") && message.includes("tasks");

  return NextResponse.json(
    {
      error: isMissingColumn
        ? `Schema Supabase incomplet: ${message}. Executez la migration supabase/migrations/0005_tasks_module.sql puis reessayez.`
        : message,
      code
    },
    { status: isMissingColumn ? 500 : 400 }
  );
}

export async function GET(request: Request) {
  try {
    const context = await getTenantContext();
    if (!context) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });
    const url = new URL(request.url);
    const result = await listTasks(context, {
      query: url.searchParams.get("query") ?? "",
      status: url.searchParams.get("status") ?? "",
      priority: url.searchParams.get("priority") ?? "",
      due: url.searchParams.get("due") ?? "",
      personId: url.searchParams.get("personId") ?? "",
      organizationId: url.searchParams.get("organizationId") ?? "",
      relationshipId: url.searchParams.get("relationshipId") ?? "",
      interactionId: url.searchParams.get("interactionId") ?? "",
      page: Number(url.searchParams.get("page") ?? 1),
      pageSize: Number(url.searchParams.get("pageSize") ?? 10)
    });
    return NextResponse.json({ data: result.tasks, pagination: { total: result.total, page: result.page, pageSize: result.pageSize, pageCount: result.pageCount } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await getTenantContext();
    if (!context) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });
    const body = await request.json();
    const parsed = parseTaskInput(body);
    if (!parsed.success) return validationErrorResponse(parsed.error);

    const task = await createTask(context, parsed.data);
    return NextResponse.json({ data: task }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
