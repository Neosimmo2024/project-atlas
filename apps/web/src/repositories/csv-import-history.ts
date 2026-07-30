import { parseCsvImportCancellationEligibility, parseCsvImportCancellationReport, type CsvImportCancellationEligibility, type CsvImportCancellationReport, type CsvImportHistoryRow } from "@/features/csv-import/csv-import-history";
import { ApiError } from "@/lib/api-errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CsvImportCancellation, CsvImportRun, TenantContext } from "@/types/domain";

export type CsvImportHistoryResult = {
  imports: CsvImportHistoryRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type CsvImportDetail = {
  run: CsvImportRun;
  requestedByLabel: string;
  cancellation: CsvImportCancellation | null;
  eligibility: CsvImportCancellationEligibility;
};

const DEFAULT_PAGE_SIZE = 10;

function pageRange(page: number, pageSize: number) {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safePageSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.min(Math.floor(pageSize), 50) : DEFAULT_PAGE_SIZE;
  const from = (safePage - 1) * safePageSize;
  return { page: safePage, pageSize: safePageSize, from, to: from + safePageSize - 1 };
}

function labelForProfile(profile: { full_name: string | null; email: string | null } | undefined, fallback: string) {
  return profile?.full_name?.trim() || profile?.email?.trim() || fallback;
}

async function profileLabels(userIds: string[]) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map<string, string>();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", uniqueIds);
  if (error) throw error;

  return new Map((data ?? []).map((profile) => [
    String(profile.id),
    labelForProfile(profile as { full_name: string | null; email: string | null }, String(profile.id))
  ]));
}

async function cancellationByImportIds(context: TenantContext, importIds: string[]) {
  if (importIds.length === 0) return new Map<string, CsvImportCancellation>();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("csv_import_cancellations")
    .select("*")
    .eq("tenant_id", context.tenantId)
    .in("import_run_id", importIds);
  if (error) throw error;
  return new Map((data ?? []).map((row) => [String(row.import_run_id), row as CsvImportCancellation]));
}

export async function listCsvImportHistory(context: TenantContext, params: { page?: number; pageSize?: number } = {}): Promise<CsvImportHistoryResult> {
  const { page, pageSize, from, to } = pageRange(params.page ?? 1, params.pageSize ?? DEFAULT_PAGE_SIZE);
  const supabase = await createSupabaseServerClient();
  const { data, error, count } = await supabase
    .from("csv_import_runs")
    .select("*", { count: "exact" })
    .eq("tenant_id", context.tenantId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .range(from, to);

  if (error) throw error;

  const rows = (data ?? []) as CsvImportRun[];
  const [profiles, cancellations] = await Promise.all([
    profileLabels(rows.map((row) => row.requested_by)),
    cancellationByImportIds(context, rows.map((row) => row.id))
  ]);

  return {
    imports: rows.map((run) => {
      const cancellation = cancellations.get(run.id);
      return {
        id: run.id,
        sourceName: run.source_name,
        requestedBy: run.requested_by,
        requestedByLabel: profiles.get(run.requested_by) ?? "Utilisateur Atlas",
        status: run.status,
        cancellationStatus: cancellation?.status ?? null,
        totalRows: run.total_rows,
        peopleCreated: run.people_created,
        peopleLinked: run.people_linked,
        organizationsCreated: run.organizations_created,
        organizationsLinked: run.organizations_linked,
        relationshipsCreated: run.relationships_created,
        rowsIgnored: run.rows_ignored,
        rowsReviewLater: run.rows_review_later,
        rowsRejected: run.rows_rejected,
        createdAt: run.created_at
      };
    }),
    total: count ?? rows.length,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil((count ?? rows.length) / pageSize))
  };
}

export async function analyzeCsvImportCancellation(context: TenantContext, importId: string): Promise<CsvImportCancellationEligibility> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("analyze_csv_import_cancellation", {
    p_tenant_id: context.tenantId,
    p_import_run_id: importId,
    p_actor_user_id: context.userId
  });
  if (error) throw error;
  return parseCsvImportCancellationEligibility(data);
}

export async function getCsvImportDetail(context: TenantContext, importId: string): Promise<CsvImportDetail> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("csv_import_runs")
    .select("*")
    .eq("tenant_id", context.tenantId)
    .eq("id", importId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new ApiError("Import introuvable.", 404, "CSV_IMPORT_NOT_FOUND");

  const run = data as CsvImportRun;
  const [profiles, cancellations, eligibility] = await Promise.all([
    profileLabels([run.requested_by]),
    cancellationByImportIds(context, [run.id]),
    analyzeCsvImportCancellation(context, run.id)
  ]);

  return {
    run,
    requestedByLabel: profiles.get(run.requested_by) ?? "Utilisateur Atlas",
    cancellation: cancellations.get(run.id) ?? null,
    eligibility
  };
}

export async function cancelCsvImport(context: TenantContext, importId: string, idempotencyKey: string): Promise<CsvImportCancellationReport> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("cancel_csv_import", {
    p_tenant_id: context.tenantId,
    p_import_run_id: importId,
    p_idempotency_key: idempotencyKey,
    p_actor_user_id: context.userId,
    p_confirm: true
  });
  if (error) throw error;
  return parseCsvImportCancellationReport(data);
}
