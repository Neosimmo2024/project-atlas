import { NextResponse } from "next/server";
import { z } from "zod";
import { CSV_IMPORT_FIELDS, type CsvImportMappingValue } from "@/features/csv-import/csv-import";
import { validateCsvImportMapping } from "@/features/csv-import/csv-import-mapping";
import { ApiError } from "@/lib/api-errors";
import { apiErrorResponse } from "@/lib/security/api-errors";
import { executeTenantCsvImport } from "@/repositories/csv-import-execution";
import { previewTenantCsvImport } from "@/repositories/csv-import-preview";
import { getTenantContext } from "@/repositories/tenant-context";

const mappingValueSchema = z.union([z.enum(CSV_IMPORT_FIELDS), z.literal("ignore")]);
const decisionSchema = z.object({
  lineNumber: z.number().int().positive(),
  decision: z.enum(["create_new", "link_existing", "ignore_row", "review_later"]),
  targetPersonId: z.string().uuid().nullable().optional(),
  targetOrganizationId: z.string().uuid().nullable().optional()
});

const requestSchema = z.object({
  content: z.string(),
  mapping: z.record(z.string(), mappingValueSchema),
  decisions: z.array(decisionSchema),
  analysisFingerprint: z.string().min(1),
  idempotencyKey: z.string().min(8).max(160),
  sourceName: z.string().max(255).nullable().optional(),
  confirm: z.boolean().optional()
});

export async function POST(request: Request) {
  try {
    const context = await getTenantContext();
    if (!context) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });
    if (context.role === "reader") throw new ApiError("Action non autorisee.", 403, "FORBIDDEN");

    const body = requestSchema.parse(await request.json()) as {
      content: string;
      mapping: Record<string, CsvImportMappingValue>;
      decisions: z.infer<typeof decisionSchema>[];
      analysisFingerprint: string;
      idempotencyKey: string;
      sourceName?: string | null;
      confirm?: boolean;
    };
    if (body.confirm !== true) {
      throw new ApiError("Confirmez explicitement l'import avant de lancer l'execution.", 400, "CSV_IMPORT_CONFIRMATION_REQUIRED");
    }

    const preview = await previewTenantCsvImport(context, {
      content: body.content,
      mapping: body.mapping
    });
    const mappingValidation = validateCsvImportMapping(preview.headers, body.mapping);
    if (!mappingValidation.valid) {
      throw new ApiError(mappingValidation.errors.join(" "), 400, "CSV_IMPORT_MAPPING_VALIDATION_FAILED");
    }

    const report = await executeTenantCsvImport(context, {
      preview,
      decisions: body.decisions,
      analysisFingerprint: body.analysisFingerprint,
      idempotencyKey: body.idempotencyKey,
      sourceName: body.sourceName ?? null
    });

    return NextResponse.json({ data: report });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export const dynamic = "force-dynamic";
