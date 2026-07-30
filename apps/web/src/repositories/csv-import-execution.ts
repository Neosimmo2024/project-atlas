import { buildCsvImportExecutionRows, parseCsvImportExecutionReport, type CsvImportExecutionReport } from "@/features/csv-import/csv-import-execution";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import type { CsvImportPreparedDecision, CsvImportPreviewResult } from "@/features/csv-import/csv-import";
import type { TenantContext } from "@/types/domain";

export type ExecuteCsvImportInput = {
  preview: CsvImportPreviewResult;
  decisions: CsvImportPreparedDecision[];
  analysisFingerprint: string;
  idempotencyKey: string;
  sourceName?: string | null;
  addToPipeline?: boolean;
};

export async function executeTenantCsvImport(context: TenantContext, input: ExecuteCsvImportInput): Promise<CsvImportExecutionReport> {
  const rows = buildCsvImportExecutionRows(input.preview, input.decisions, input.analysisFingerprint);
  const supabase = createSupabaseServiceRoleClient();

  const { data, error } = await supabase.rpc("execute_csv_import", {
    p_tenant_id: context.tenantId,
    p_idempotency_key: input.idempotencyKey,
    p_source_name: input.sourceName ?? null,
    p_analysis_fingerprint: input.analysisFingerprint,
    p_rows: rows,
    p_actor_user_id: context.userId,
    p_add_to_pipeline: input.addToPipeline === true
  });

  if (error) throw error;
  return parseCsvImportExecutionReport(data);
}
