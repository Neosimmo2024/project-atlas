import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/security/api-errors";
import { listTenantMembers } from "@/repositories/tenant-admin";
import { getTenantContext } from "@/repositories/tenant-context";

export async function GET() {
  try {
    const context = await getTenantContext();
    if (!context) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });

    const members = await listTenantMembers(context);
    return NextResponse.json({ data: members });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
