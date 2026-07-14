import { NextResponse } from "next/server";
import { parsePersonInput } from "@/features/people/validation";
import { deletePerson, findPotentialPersonDuplicates, getPersonDetail, updatePerson } from "@/repositories/people";
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
  const detail = await getPersonDetail(tenantContext, id);
  if (!detail) return NextResponse.json({ error: "Person not found" }, { status: 404 });

  return NextResponse.json({ data: detail });
}

export async function PUT(request: Request, context: RouteContext) {
  const tenantContext = await getTenantContext();
  if (!tenantContext) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });

  const { id } = await context.params;
  const body = await request.json();
  const parsed = parsePersonInput(body);
  if (!parsed.success) return validationErrorResponse(parsed.error);

  const duplicates = await findPotentialPersonDuplicates(tenantContext, parsed.data, id);
  if (duplicates.length > 0 && body.confirmDuplicate !== true) {
    return NextResponse.json({ warning: "Potential duplicate found", duplicates }, { status: 409 });
  }

  const person = await updatePerson(tenantContext, id, parsed.data);
  return NextResponse.json({ data: person });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const tenantContext = await getTenantContext();
  if (!tenantContext) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });

  const { id } = await context.params;
  const result = await deletePerson(tenantContext, id);
  if (!result.allowed) return NextResponse.json({ error: "Only owner and admin roles can delete people." }, { status: 403 });

  return NextResponse.json({ deleted: true });
}
