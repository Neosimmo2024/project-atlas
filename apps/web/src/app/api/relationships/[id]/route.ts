import { NextResponse } from "next/server";
import { parseRelationshipInput } from "@/features/relationships/validation";
import { deleteRelationship, findPotentialRelationshipDuplicates, getRelationshipDetail, updateRelationship } from "@/repositories/relationships";
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
  const isUniqueViolation = code === "23505";
  const isMissingColumn = code === "42703" || message.includes("does not exist");

  return NextResponse.json(
    {
      error: isUniqueViolation
        ? "Une relation active identique existe deja pour cette personne, cette organisation et ce type."
        : isMissingColumn
          ? `Schema Supabase incomplet: ${message}. Executez la migration supabase/migrations/0003_relationships_module.sql puis reessayez.`
          : message,
      code
    },
    { status: isMissingColumn ? 500 : 400 }
  );
}

export async function GET(_request: Request, context: RouteContext) {
  const tenantContext = await getTenantContext();
  if (!tenantContext) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });

  const { id } = await context.params;
  const detail = await getRelationshipDetail(tenantContext, id);
  if (!detail) return NextResponse.json({ error: "Relationship not found" }, { status: 404 });

  return NextResponse.json({ data: detail });
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const tenantContext = await getTenantContext();
    if (!tenantContext) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });

    const { id } = await context.params;
    const body = await request.json();
    const parsed = parseRelationshipInput(body);
    if (!parsed.success) return validationErrorResponse(parsed.error);

    const duplicates = await findPotentialRelationshipDuplicates(tenantContext, parsed.data, id);
    if (duplicates.length > 0 && body.confirmDuplicate !== true) {
      return NextResponse.json({ warning: "Potential duplicate found", duplicates }, { status: 409 });
    }

    const relationship = await updateRelationship(tenantContext, id, parsed.data);
    return NextResponse.json({ data: relationship });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const tenantContext = await getTenantContext();
    if (!tenantContext) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });

    const { id } = await context.params;
    const result = await deleteRelationship(tenantContext, id);
    if (!result.allowed) return NextResponse.json({ error: "Only owner and admin roles can delete relationships." }, { status: 403 });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
