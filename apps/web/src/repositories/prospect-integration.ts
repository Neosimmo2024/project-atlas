import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import type { TenantContext } from "@/types/domain";
import { savedCandidateSchema } from "@/features/prospect-discovery/enterprise-search";
import { buildProspectImport } from "@/features/prospect-discovery/integration";
import type { CsvImportPreviewResult } from "@/features/csv-import/csv-import";
import { parseCsvImportExecutionReport } from "@/features/csv-import/csv-import-execution";

export async function loadProspectImport(context: TenantContext, listId: string, siret: string) {
  if (context.role === "reader") throw new ApiError("Action non autorisée.", 403, "FORBIDDEN");
  const db = await createSupabaseServerClient();
  const [{ data: list, error: listError }, { data: review, error: reviewError }] = await Promise.all([
    db.from("prospect_lists").select("candidates").eq("tenant_id", context.tenantId).eq("id", listId).maybeSingle(),
    db.from("prospect_reviews").select("*").eq("tenant_id", context.tenantId).eq("list_id", listId).eq("siret", siret).maybeSingle()
  ]);
  if (listError || reviewError) throw new ApiError("La fiche est momentanément inaccessible.", 503, "PROSPECT_UNAVAILABLE");
  const item = savedCandidateSchema.safeParse(list?.candidates).data?.find(c => c.siret === siret);
  if (!item || !review) throw new ApiError("Prospect introuvable.", 404, "PROSPECT_NOT_FOUND");
  try { return buildProspectImport(listId, item, review); }
  catch { throw new ApiError("Retenez le prospect après vérification et renseignez le nom de l’interlocuteur avant l’intégration.", 400, "PROSPECT_NOT_READY"); }
}

export async function assertProspectMatchesContactable(context: TenantContext, preview: CsvImportPreviewResult) {
  const db = await createSupabaseServerClient();
  const people = [...new Set(preview.rows.flatMap(r => [r.existingPersonId, ...r.duplicatePersonIds, ...r.possibleDuplicatePersonIds]).filter(Boolean))] as string[];
  const organizations = [...new Set(preview.rows.flatMap(r => [...r.duplicateOrganizationIds, ...r.possibleDuplicateOrganizationIds]))];
  for (const [table, ids] of [["people", people], ["organizations", organizations]] as const) {
    if (!ids.length) continue;
    const { data, error } = await db.from(table).select("id").eq("tenant_id", context.tenantId).in("id", ids).eq("do_not_contact", true).limit(1);
    if (error) throw new ApiError("Vérification des exclusions indisponible.", 503, "EXCLUSIONS_UNAVAILABLE");
    if (data?.length) throw new ApiError("Une fiche correspondante est marquée « Ne plus contacter ». L’intégration est bloquée.", 409, "PROSPECT_EXCLUDED");
  }
}

export async function findCompletedProspectImport(context: TenantContext, idempotencyKey: string) {
  const db = await createSupabaseServerClient();
  const { data, error } = await db.from("csv_import_runs").select("id,report")
    .eq("tenant_id", context.tenantId).eq("idempotency_key", idempotencyKey).maybeSingle();
  if (error) throw new ApiError("Historique momentanément indisponible.", 503, "IMPORT_HISTORY_UNAVAILABLE");
  if (!data) return null;
  const { data: cancellation, error: cancellationError } = await db.from("csv_import_cancellations").select("id")
    .eq("tenant_id", context.tenantId).eq("import_run_id", data.id).maybeSingle();
  if (cancellationError) throw new ApiError("Historique momentanément indisponible.", 503, "IMPORT_HISTORY_UNAVAILABLE");
  if (cancellation) throw new ApiError("Cette intégration a fait l’objet d’une demande d’annulation. Consultez son historique avant toute nouvelle action.", 409, "IMPORT_CANCELLED");
  return parseCsvImportExecutionReport({ ...data.report, id: data.id, idempotent: true });
}
