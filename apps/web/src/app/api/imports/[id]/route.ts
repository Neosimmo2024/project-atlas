import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/security/api-errors";
import { getCsvImportDetail } from "@/repositories/csv-import-history";
import { getTenantContext } from "@/repositories/tenant-context";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const context = await getTenantContext();
    if (!context) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });

    const { id } = await params;
    const detail = await getCsvImportDetail(context, id);
    return NextResponse.json({ data: detail });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export const dynamic = "force-dynamic";
