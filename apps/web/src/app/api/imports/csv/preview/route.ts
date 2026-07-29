import { NextResponse } from "next/server";
import { z } from "zod";
import { CSV_IMPORT_FIELDS, type CsvImportMappingValue } from "@/features/csv-import/csv-import";
import { apiErrorResponse } from "@/lib/security/api-errors";
import { getTenantContext } from "@/repositories/tenant-context";
import { previewTenantCsvImport } from "@/repositories/csv-import-preview";

const mappingValueSchema = z.union([z.enum(CSV_IMPORT_FIELDS), z.literal("ignore")]);
const requestSchema = z.object({
  content: z.string(),
  mapping: z.record(z.string(), mappingValueSchema).optional()
});

export async function POST(request: Request) {
  try {
    const context = await getTenantContext();
    if (!context) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });

    const body = requestSchema.parse(await request.json()) as { content: string; mapping?: Record<string, CsvImportMappingValue> };
    const result = await previewTenantCsvImport(context, body);
    return NextResponse.json({ data: result });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export const dynamic = "force-dynamic";
