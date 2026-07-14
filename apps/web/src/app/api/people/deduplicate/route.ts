import { NextResponse } from "next/server";
import { parsePersonInput } from "@/features/people/validation";
import { findPotentialPersonDuplicates } from "@/repositories/people";
import { getTenantContext } from "@/repositories/tenant-context";

export async function POST(request: Request) {
  const context = await getTenantContext();
  if (!context) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });

  const body = await request.json();
  const parsed = parsePersonInput(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fields: parsed.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })) },
      { status: 400 }
    );
  }

  const duplicates = await findPotentialPersonDuplicates(context, parsed.data, typeof body.excludePersonId === "string" ? body.excludePersonId : undefined);
  return NextResponse.json({ duplicates });
}
