"use server";

import { redirect } from "next/navigation";
import { getTenantContext } from "@/repositories/tenant-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { searchEnterprises, searchInput } from "@/features/prospect-discovery/enterprise-search";

import { searchAllEnterprises } from "@/features/prospect-discovery/search-all";

export async function saveProspectList(form: FormData) {
  const context = await getTenantContext();
  if (!context || !["owner", "admin", "recruiter", "manager"].includes(context.role)) {
    throw new Error("Vous ne pouvez pas enregistrer une liste.");
  }
  const input = searchInput.safeParse({ postalCode: form.get("postalCode"), page: form.get("page"), target: form.get("target") ?? undefined });
  const name = String(form.get("name") ?? "").trim();
  if (!input.success || !name || name.length > 100) throw new Error("Vérifiez le nom de la liste et le secteur.");
  const scope = form.get("scope") ?? "page";
  if (scope !== "page" && scope !== "all") throw new Error("Choisissez la portée de la liste.");
  // Re-read the source: a submitted candidate payload is never trusted.
  let saved = false;
  let reason = "";
  try {
    const result = scope === "all" ? await searchAllEnterprises(input.data) : await searchEnterprises(input.data);
    if (result.candidates.length) {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.from("prospect_lists").insert({
        tenant_id: context.tenantId, created_by: context.userId, name,
        postal_code: input.data.target === "saint_maur" ? "94100" : input.data.postalCode, source_page: scope === "all" ? 1 : input.data.page,
        target_key: input.data.target,
        candidates: result.candidates
      });
      saved = !error;
    }
  } catch (error) {
    saved = false;
    if (error instanceof Error && error.message === "PROSPECT_TARGET_TOO_LARGE") reason = "too_large";
    if (error instanceof Error && error.message === "PROSPECT_SOURCE_CHANGED") reason = "changed";
  }
  redirect(`/prospects?${new URLSearchParams({ saved: saved ? "1" : "0", ...(reason ? { reason } : {}) })}`);
}
