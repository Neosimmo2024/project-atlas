import { NextResponse } from "next/server";
import { parseInteractionInput } from "@/features/interactions/validation";
import { apiErrorResponse } from "@/lib/security/api-errors";
import { createInteraction, listInteractions } from "@/repositories/interactions";
import { getTenantContext } from "@/repositories/tenant-context";

function validationErrorResponse(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  return NextResponse.json(
    { error: "Validation failed", fields: error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })) },
    { status: 400 }
  );
}

export async function GET(request: Request) {
  const context = await getTenantContext();
  if (!context) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });
  const url = new URL(request.url);
  const result = await listInteractions(context, {
    query: url.searchParams.get("query") ?? "",
    typeId: url.searchParams.get("typeId") ?? "",
    personId: url.searchParams.get("personId") ?? "",
    organizationId: url.searchParams.get("organizationId") ?? "",
    relationshipId: url.searchParams.get("relationshipId") ?? "",
    projectId: url.searchParams.get("projectId") ?? "",
    page: Number(url.searchParams.get("page") ?? 1),
    pageSize: Number(url.searchParams.get("pageSize") ?? 10)
  });
  return NextResponse.json({ data: result.interactions, pagination: { total: result.total, page: result.page, pageSize: result.pageSize, pageCount: result.pageCount } });
}

export async function POST(request: Request) {
  try {
    const context = await getTenantContext();
    if (!context) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });
    const body = await request.json();
    const parsed = parseInteractionInput(body);
    if (!parsed.success) return validationErrorResponse(parsed.error);

    const interaction = await createInteraction(context, parsed.data);
    return NextResponse.json({ data: interaction }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
