import { NextResponse } from "next/server";
import { parseInteractionInput } from "@/features/interactions/validation";
import { createInteraction, listInteractions } from "@/repositories/interactions";
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
  const isMissingColumn = code === "42703" || message.includes("does not exist");

  return NextResponse.json(
    {
      error: isMissingColumn
        ? `Schema Supabase incomplet: ${message}. Executez la migration supabase/migrations/0004_interactions_module.sql puis reessayez.`
        : message,
      code
    },
    { status: isMissingColumn ? 500 : 400 }
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
