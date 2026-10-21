import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantContext } from "./tenant-context";

export const contactHistoryStatuses = {
  pending: "À vérifier — opération non clôturée",
  created: "Contact créé",
  suppressed: "Campagnes email et SMS bloquées",
  blocked: "Synchronisation bloquée",
  skipped: "Aucune modification nécessaire",
  failed: "Échec",
  write_outcome_unknown: "À vérifier — résultat incertain",
} as const;
export type ContactHistoryStatus = keyof typeof contactHistoryStatuses;
export type ContactHistoryRow = {
  id: string; person_id: string; status: ContactHistoryStatus;
  created_at: string; finished_at: string | null;
  result_code: string | null; provider_contact_id: number | null;
  review?: { decision: "linked_observed_keep_blocked" | "suppression_observed_keep_blocked"; closed_at: string };
};
export type ContactHistoryResult =
  | { state: "forbidden" | "unavailable" | "not_installed" }
  | { state: "ready"; rows: ContactHistoryRow[]; total: number; page: number; status: ContactHistoryStatus | ""; tenantName: string };

/** Read-only history through the signed-in client's RLS; never calls Brevo. */
export async function listBrevoContactHistory(params: { page?: string; status?: string } = {}): Promise<ContactHistoryResult> {
  try {
    const context = await getTenantContext();
    if (!context || !["owner", "admin"].includes(context.role)) return { state: "forbidden" };
    const parsedPage = Number(params.page ?? 1);
    const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? Math.min(parsedPage, 10000) : 1;
    const status = params.status && Object.hasOwn(contactHistoryStatuses, params.status) ? params.status as ContactHistoryStatus : "";
    const db = await createSupabaseServerClient();
    let query = db.from("brevo_contact_sync_attempts")
      .select("id, person_id, status, created_at, finished_at, result_code, provider_contact_id", { count: "exact" })
      .eq("tenant_id", context.tenantId);
    if (status) query = query.eq("status", status);
    const { data, error, count } = await query.order("created_at", { ascending: false }).order("id", { ascending: false })
      .range((page - 1) * 20, page * 20 - 1);
    if (error) return { state: ["42P01", "PGRST205"].includes(error.code) ? "not_installed" : "unavailable" };
    if (!Array.isArray(data) || count === null) return { state: "unavailable" };
    const rows = data as ContactHistoryRow[];
    if (rows.length) {
      const { data: reviews, error: reviewError } = await db.from("brevo_contact_reviews")
        .select("attempt_id, decision, closed_at").eq("tenant_id", context.tenantId).in("attempt_id", rows.map(row => row.id));
      if (reviewError || !Array.isArray(reviews)) return { state: "unavailable" };
      for (const review of reviews) {
        const row = rows.find(row => row.id === review.attempt_id);
        if (!row || !["linked_observed_keep_blocked", "suppression_observed_keep_blocked"].includes(review.decision)
          || typeof review.closed_at !== "string" || !Number.isFinite(Date.parse(review.closed_at))) return { state: "unavailable" };
        row.review = { decision: review.decision, closed_at: review.closed_at };
      }
    }
    return { state: "ready", rows, total: count, page, status, tenantName: context.tenant.name };
  } catch {
    return { state: "unavailable" };
  }
}
