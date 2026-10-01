"use server";

import { redirect } from "next/navigation";
import { getTenantContext } from "@/repositories/tenant-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { searchEnterprises, searchInput } from "@/features/prospect-discovery/enterprise-search";

export async function saveProspectList(form: FormData) {
  const context = await getTenantContext();
  if (!context || !["owner", "admin", "recruiter", "manager"].includes(context.role)) {
    throw new Error("Vous ne pouvez pas enregistrer une liste.");
  }
  const input = searchInput.safeParse({ postalCode: form.get("postalCode"), page: form.get("page"), target: form.get("target") ?? undefined });
  const name = String(form.get("name") ?? "").trim();
  if (!input.success || !name || name.length > 100) throw new Error("Vérifiez le nom de la liste et le secteur.");
  // Re-read the source: a submitted candidate payload is never trusted.
  let saved = false;
  try {
    const result = await searchEnterprises(input.data);
    if (result.candidates.length) {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.from("prospect_lists").insert({
        tenant_id: context.tenantId, created_by: context.userId, name,
        postal_code: input.data.postalCode, source_page: input.data.page,
        target_key: input.data.target,
        candidates: result.candidates
      });
      saved = !error;
    }
  } catch { saved = false; }
  redirect(`/prospects?${new URLSearchParams({ saved: saved ? "1" : "0" })}`);
}
