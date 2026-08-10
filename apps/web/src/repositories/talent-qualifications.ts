import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TalentQualification, TenantContext } from "@/types/domain";
import type { TalentQualificationInput } from "@/features/talent-qualification/validation";

export async function getTalentQualification(context: TenantContext, personId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("talent_qualifications").select("*")
    .eq("tenant_id", context.tenantId).eq("person_id", personId).maybeSingle();
  if (error) throw error;
  return data as TalentQualification | null;
}

export async function saveTalentQualification(context: TenantContext, personId: string, input: TalentQualificationInput, finalize: boolean) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("save_talent_qualification", {
    p_person_id: personId,
    p_payload: input,
    p_finalize: finalize
  });
  if (error) throw error;
  return data as TalentQualification;
}
