import { NextResponse } from "next/server";
import { parseOrganizationInput } from "@/features/organizations/validation";
import { deleteOrganization, findPotentialOrganizationDuplicates, getOrganizationDetail, updateOrganization } from "@/repositories/organizations";
import { getTenantContext } from "@/repositories/tenant-context";

type RouteContext = { params: Promise<{ id: string }> };

function validationErrorResponse(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  return NextResponse.json(
    { error: "Validation failed", fields: error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })) },
    { status: 400 }
  );
}

export async function GET(_request: Request, context: RouteContext) {
  const tenantContext = await getTenantContext();
  if (!tenantContext) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });

  const { id } = await context.params;
  const detail = await getOrganizationDetail(tenantContext, id);
  if (!detail) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

  return NextResponse.json({ data: detail });
}

export async function PUT(request: Request, context: RouteContext) {
  const tenantContext = await getTenantContext();
  if (!tenantContext) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });

  const { id } = await context.params;
  const body = await request.json();
  const parsed = parseOrganizationInput(body);
  if (!parsed.success) return validationErrorResponse(parsed.error);
  if (parsed.data.parent_organization_id === id) {
    return NextResponse.json({ error: "Validation failed", fields: [{ field: "parent_organization_id", message: "Une organisation ne peut pas etre son propre parent." }] }, { status: 400 });
  }

  const duplicates = await findPotentialOrganizationDuplicates(tenantContext, parsed.data, id);
  if (duplicates.length > 0 && body.confirmDuplicate !== true) {
    return NextResponse.json({ warning: "Potential duplicate found", duplicates }, { status: 409 });
  }

  const organization = await updateOrganization(tenantContext, id, parsed.data);
  return NextResponse.json({ data: organization });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const tenantContext = await getTenantContext();
  if (!tenantContext) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });

  const { id } = await context.params;
  const result = await deleteOrganization(tenantContext, id);
  if (!result.allowed) return NextResponse.json({ error: "Only owner and admin roles can delete organizations." }, { status: 403 });

  return NextResponse.json({ deleted: true });
}
