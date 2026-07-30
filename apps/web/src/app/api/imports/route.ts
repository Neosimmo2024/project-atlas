import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/security/api-errors";
import { listCsvImportHistory } from "@/repositories/csv-import-history";
import { getTenantContext } from "@/repositories/tenant-context";

function numberParam(url: URL, key: string, fallback: number) {
  const value = Number(url.searchParams.get(key) ?? fallback);
  return Number.isFinite(value) ? value : fallback;
}

export async function GET(request: Request) {
  try {
    const context = await getTenantContext();
    if (!context) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });

    const url = new URL(request.url);
    const result = await listCsvImportHistory(context, {
      page: numberParam(url, "page", 1),
      pageSize: numberParam(url, "pageSize", 10)
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export const dynamic = "force-dynamic";
