import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { RecruitmentEmailSequence, TenantContext } from "@/types/domain";

export async function getRecruitmentEmailSequence(context: TenantContext, personId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("recruitment_email_sequences")
    .select("*")
    .eq("tenant_id", context.tenantId)
    .eq("person_id", personId)
    .maybeSingle();
  if (error) throw error;
  return (data as RecruitmentEmailSequence | null) ?? null;
}

export async function claimRecruitmentEmailSequence(context: TenantContext, personId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("claim_initial_recruitment_email", { p_person_id: personId });
  if (error) throw error;
  const sequence = data as RecruitmentEmailSequence;
  if (sequence.tenant_id !== context.tenantId) throw new Error("Séquence inaccessible.");
  return sequence;
}

export async function completeRecruitmentEmailSequence(
  context: TenantContext,
  sequenceId: string,
  result: { success: boolean; providerMessageId?: string | null; error?: string | null }
) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("complete_initial_recruitment_email", {
    p_sequence_id: sequenceId,
    p_success: result.success,
    p_provider_message_id: result.providerMessageId ?? null,
    p_error: result.error ?? null
  });
  if (error) throw error;
  const sequence = data as RecruitmentEmailSequence;
  if (sequence.tenant_id !== context.tenantId) throw new Error("Séquence inaccessible.");
  return sequence;
}

export async function stopRecruitmentEmailSequence(context: TenantContext, sequenceId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("stop_initial_recruitment_email", { p_sequence_id: sequenceId });
  if (error) throw error;
  const sequence = data as RecruitmentEmailSequence;
  if (sequence.tenant_id !== context.tenantId) throw new Error("Séquence inaccessible.");
  return sequence;
}
