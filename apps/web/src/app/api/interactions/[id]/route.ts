import { NextResponse } from "next/server";
import { parseInteractionInput } from "@/features/interactions/validation";
import { deleteInteraction, updateInteraction } from "@/repositories/interactions";
import { getTenantContext } from "@/repositories/tenant-context";

type RouteContext = { params: Promise<{ id: string }> };

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

export async function PUT(request: Request, context: RouteContext) {
  try {
    const tenantContext = await getTenantContext();
    if (!tenantContext) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });

    const { id } = await context.params;
    const body = await request.json();
    const parsed = parseInteractionInput(body);
    if (!parsed.success) return validationErrorResponse(parsed.error);

    const interaction = await updateInteraction(tenantContext, id, parsed.data);
    return NextResponse.json({ data: interaction });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const tenantContext = await getTenantContext();
    if (!tenantContext) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });

    const { id } = await context.params;
    const result = await deleteInteraction(tenantContext, id);
    if (!result.allowed) return NextResponse.json({ error: "Only owner and admin roles can delete interactions." }, { status: 403 });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
