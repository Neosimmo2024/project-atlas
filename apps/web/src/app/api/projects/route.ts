import { NextResponse } from "next/server";
import { parseProjectInput } from "@/features/projects/validation";
import { apiErrorResponse } from "@/lib/security/api-errors";
import { createProject, listProjects } from "@/repositories/projects";
import { getTenantContext } from "@/repositories/tenant-context";

function validationErrorResponse(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  return NextResponse.json(
    { error: "Validation failed", fields: error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })) },
    { status: 400 }
  );
}

export async function GET(request: Request) {
  try {
    const context = await getTenantContext();
    if (!context) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });

    const url = new URL(request.url);
    const result = await listProjects(context, {
      query: url.searchParams.get("query") ?? "",
      organizationId: url.searchParams.get("organizationId") ?? "",
      personId: url.searchParams.get("personId") ?? "",
      relationshipId: url.searchParams.get("relationshipId") ?? "",
      ownerId: url.searchParams.get("ownerId") ?? "",
      type: url.searchParams.get("type") ?? "",
      status: url.searchParams.get("status") ?? "",
      stage: url.searchParams.get("stage") ?? "",
      includeArchived: url.searchParams.get("includeArchived") ?? "",
      page: Number(url.searchParams.get("page") ?? 1),
      pageSize: Number(url.searchParams.get("pageSize") ?? 10)
    });

    return NextResponse.json({ data: result.projects, pagination: { total: result.total, page: result.page, pageSize: result.pageSize, pageCount: result.pageCount } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await getTenantContext();
    if (!context) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });
    const body = await request.json();
    const parsed = parseProjectInput(body);
    if (!parsed.success) return validationErrorResponse(parsed.error);

    const project = await createProject(context, parsed.data);
    return NextResponse.json({ data: project }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
