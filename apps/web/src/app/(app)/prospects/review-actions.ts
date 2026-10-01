"use server";
import { redirect } from "next/navigation";
import { getTenantContext } from "@/repositories/tenant-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { savedCandidateSchema } from "@/features/prospect-discovery/enterprise-search";
import { reviewSchema } from "@/features/prospect-discovery/review";

export async function saveProspectReview(form: FormData) {
  const context = await getTenantContext();
  if (!context || !["owner", "admin", "recruiter", "manager"].includes(context.role)) throw new Error("Vous ne pouvez pas qualifier un prospect.");
  const parsed = reviewSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect("/prospects?review=invalid");
  const value = parsed.data;
  const db = await createSupabaseServerClient();
  const { data: list, error } = await db.from("prospect_lists").select("candidates")
    .eq("tenant_id", context.tenantId).eq("id", value.listId).maybeSingle();
  if (error || !savedCandidateSchema.safeParse(list?.candidates).data?.some(c => c.siret === value.siret)) redirect("/prospects?review=failed");
  const { error: saveError } = await db.from("prospect_reviews").upsert({
    tenant_id: context.tenantId, list_id: value.listId, siret: value.siret,
    status: value.status, kind: value.kind, email: value.email.toLowerCase(), phone: value.phone,
    first_name: value.firstName, last_name: value.lastName,
    linkedin_url: value.linkedinUrl, linkedin_status: value.linkedinStatus,
    linkedin_role: value.linkedinRole, linkedin_network: value.linkedinNetwork,
    linkedin_area: value.linkedinArea, linkedin_evidence: value.linkedinEvidence,
    linkedin_checked_on: value.linkedinCheckedOn || null,
    source_url: value.sourceUrl, notes: value.notes, reviewed_by: context.userId
  }, { onConflict: "list_id,siret" });
  redirect(`/prospects?review=${saveError ? "failed" : "saved"}#list-${value.listId}`);
}
