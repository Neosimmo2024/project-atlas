import { NextResponse } from "next/server";
import { parseOrganizationInput } from "@/features/organizations/validation";
import { createOrganization, findPotentialOrganizationDuplicates, listOrganizations } from "@/repositories/organizations";
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
  const result = await listOrganizations(context, {
    query: url.searchParams.get("query") ?? "",
    type: url.searchParams.get("type") ?? "",
    status: url.searchParams.get("status") ?? "",
    sort: url.searchParams.get("sort") ?? "",
    page: Number(url.searchParams.get("page") ?? 1),
    pageSize: Number(url.searchParams.get("pageSize") ?? 10)
  });
  return NextResponse.json({ data: result.organizations, pagination: { total: result.total, page: result.page, pageSize: result.pageSize, pageCount: result.pageCount } });
}

export async function POST(request: Request) {
  const context = await getTenantContext();
  if (!context) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });
  const body = await request.json();
  const parsed = parseOrganizationInput(body);
  if (!parsed.success) return validationErrorResponse(parsed.error);

  const duplicates = await findPotentialOrganizationDuplicates(context, parsed.data);
  if (duplicates.length > 0 && body.confirmDuplicate !== true) {
    return NextResponse.json({ warning: "Potential duplicate found", duplicates }, { status: 409 });
  }

  const organization = await createOrganization(context, parsed.data);
  return NextResponse.json({ data: organization }, { status: 201 });
}
