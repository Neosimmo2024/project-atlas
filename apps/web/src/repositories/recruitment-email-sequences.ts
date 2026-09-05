import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { RecruitmentEmailSequence, TenantContext } from "@/types/domain";

export type RecruitmentEmailLifecycleStatus = "idle" | "scheduled" | "running" | "completed" | "stopped" | "error";
export type RecruitmentEmailSequenceStepStatus = "scheduled" | "processing" | "sent" | "error" | "cancelled";
export type RecruitmentEmailSequenceStep = {
  id: string;
  tenant_id: string;
  sequence_id: string;
  person_id: string;
  step_index: number;
  step_key: "initial" | "follow_up_1" | "follow_up_2";
  status: RecruitmentEmailSequenceStepStatus;
  scheduled_at: string;
  claimed_at: string | null;
  provider_message_id: string | null;
  sent_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type RecruitmentEmailSequenceWithSteps = RecruitmentEmailSequence & {
  lifecycle_status: RecruitmentEmailLifecycleStatus;
  current_step: number;
  next_action_at: string | null;
  attempt_count: number;
  last_attempt_at: string | null;
  completed_at: string | null;
  stop_reason: string | null;
  steps: RecruitmentEmailSequenceStep[];
};

export async function getRecruitmentEmailSequence(context: TenantContext, personId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("recruitment_email_sequences")
    .select("*")
    .eq("tenant_id", context.tenantId)
    .eq("person_id", personId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const sequence = data as RecruitmentEmailSequenceWithSteps;
  const { data: steps, error: stepsError } = await supabase
    .from("recruitment_email_sequence_steps")
    .select("id,tenant_id,sequence_id,person_id,step_index,step_key,status,scheduled_at,claimed_at,provider_message_id,sent_at,last_error,created_at,updated_at")
    .eq("tenant_id", context.tenantId)
    .eq("sequence_id", sequence.id)
    .order("step_index", { ascending: true });
  if (stepsError) throw stepsError;

  return { ...sequence, steps: (steps ?? []) as RecruitmentEmailSequenceStep[] } satisfies RecruitmentEmailSequenceWithSteps;
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
