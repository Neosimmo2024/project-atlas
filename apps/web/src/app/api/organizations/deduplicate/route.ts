import { NextResponse } from "next/server";
import { parseOrganizationInput } from "@/features/organizations/validation";
import { findPotentialOrganizationDuplicates } from "@/repositories/organizations";
import { getTenantContext } from "@/repositories/tenant-context";

export async function POST(request: Request) {
  const context = await getTenantContext();
  if (!context) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });

  const body = await request.json();
  const parsed = parseOrganizationInput(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fields: parsed.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })) },
      { status: 400 }
    );
  }

  const duplicates = await findPotentialOrganizationDuplicates(context, parsed.data, typeof body.excludeOrganizationId === "string" ? body.excludeOrganizationId : undefined);
  return NextResponse.json({ duplicates });
}
