import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { sendRecruitmentFollowUpEmail } from "@/services/brevo";

type SequenceRow = {
  id: string;
  tenant_id: string;
  person_id: string;
  email: string;
  status: "pending" | "sent" | "error" | "stopped";
  lifecycle_status: "idle" | "scheduled" | "running" | "completed" | "stopped" | "error";
  sent_at: string | null;
};

type StepRow = {
  id: string;
  tenant_id: string;
  sequence_id: string;
  person_id: string;
  step_index: number;
  step_key: "initial" | "follow_up_1" | "follow_up_2";
  status: "scheduled" | "processing" | "sent" | "error" | "cancelled";
  scheduled_at: string;
};

type PersonRow = {
  id: string;
  display_name: string;
  contact_allowed: boolean;
  do_not_contact: boolean;
};

export type RecruitmentOrchestrationSummary = {
  scheduled: number;
  stopped: number;
  claimed: number;
  sent: number;
  errors: number;
};

export async function isAuthorizedRecruitmentOrchestrator(request: Request) {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const prefix = "Bearer ";
  if (!authorization.startsWith(prefix)) return false;
  const provided = authorization.slice(prefix.length).trim();
  if (provided.length < 32) return false;

  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.rpc("verify_recruitment_cron_secret", { p_secret: provided });
  if (error) return false;
  return data === true;
}

function scheduledAt(initialSentAt: string, days: number) {
  const date = new Date(initialSentAt);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid initial recruitment sent_at timestamp.");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

async function stopSequenceForContactRestriction(sequence: SequenceRow) {
  const supabase = createSupabaseServiceRoleClient();
  const now = new Date().toISOString();
  const { error: sequenceError } = await supabase
    .from("recruitment_email_sequences")
    .update({
      status: "stopped",
      lifecycle_status: "stopped",
      next_action_at: null,
      stopped_at: now,
      stop_reason: "contact_not_allowed"
    })
    .eq("id", sequence.id);
  if (sequenceError) throw sequenceError;

  const { error: stepError } = await supabase
    .from("recruitment_email_sequence_steps")
    .update({ status: "cancelled", last_error: "Contact interdit avant planification" })
    .eq("sequence_id", sequence.id)
    .in("status", ["scheduled", "processing"]);
  if (stepError) throw stepError;

  const { error: attemptError } = await supabase
    .from("recruitment_email_sequence_attempts")
    .update({ status: "cancelled", completed_at: now, error_message: "Contact interdit avant planification" })
    .eq("sequence_id", sequence.id)
    .eq("status", "processing");
  if (attemptError) throw attemptError;
}

async function insertTimelineEvent(input: {
  sequence: SequenceRow;
  eventType: "recruitment_email_queued" | "recruitment_email_stopped";
  title: string;
  description: string;
  metadata: Record<string, unknown>;
  idempotencyKey: string;
}) {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.from("timeline_events").upsert({
    tenant_id: input.sequence.tenant_id,
    event_type: input.eventType,
    title: input.title,
    description: input.description,
    occurred_at: new Date().toISOString(),
    created_by: null,
    person_id: input.sequence.person_id,
    source_type: "person",
    source_id: input.sequence.person_id,
    metadata: input.metadata,
    visibility: "tenant",
    idempotency_key: input.idempotencyKey
  }, { onConflict: "tenant_id,idempotency_key", ignoreDuplicates: true });
  if (error) throw error;
}

async function scheduleStep(sequence: SequenceRow, stepIndex: 1 | 2, dueAt: string) {
  const supabase = createSupabaseServiceRoleClient();
  const stepKey = stepIndex === 1 ? "follow_up_1" : "follow_up_2";
  const idempotencyKey = `recruitment-email-step:${sequence.id}:${stepIndex}`;
  const { error: insertError } = await supabase
    .from("recruitment_email_sequence_steps")
    .insert({
      tenant_id: sequence.tenant_id,
      sequence_id: sequence.id,
      person_id: sequence.person_id,
      step_index: stepIndex,
      step_key: stepKey,
      status: "scheduled",
      scheduled_at: dueAt,
      idempotency_key: idempotencyKey
    });

  if (insertError && insertError.code !== "23505") throw insertError;
  if (insertError?.code === "23505") return false;

  const { error: sequenceError } = await supabase
    .from("recruitment_email_sequences")
    .update({
      lifecycle_status: "scheduled",
      current_step: stepIndex,
      next_action_at: dueAt,
      completed_at: null,
      stop_reason: null
    })
    .eq("id", sequence.id)
    .neq("lifecycle_status", "stopped")
    .neq("lifecycle_status", "completed");
  if (sequenceError) throw sequenceError;

  await insertTimelineEvent({
    sequence,
    eventType: "recruitment_email_queued",
    title: "Relance email de recrutement planifiée",
    description: `${stepKey} — ${dueAt}`,
    metadata: {
      sequence_id: sequence.id,
      step_index: stepIndex,
      scheduled_at: dueAt,
      policy: stepIndex === 1 ? "J+3" : "J+7",
      source: "lot_9b_native_orchestrator"
    },
    idempotencyKey: `recruitment_email_scheduled:${sequence.id}:${stepIndex}`
  });
  return true;
}

async function prepareFollowUps(limit = 100) {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("recruitment_email_sequences")
    .select("id,tenant_id,person_id,email,status,lifecycle_status,sent_at")
    .eq("status", "sent")
    .not("sent_at", "is", null)
    .neq("lifecycle_status", "stopped")
    .neq("lifecycle_status", "completed")
    .order("sent_at", { ascending: true })
    .limit(Math.min(Math.max(limit, 1), 500));
  if (error) throw error;

  let scheduled = 0;
  let stopped = 0;
  for (const sequence of (data ?? []) as SequenceRow[]) {
    const { data: person, error: personError } = await supabase
      .from("people")
      .select("id,display_name,contact_allowed,do_not_contact")
      .eq("id", sequence.person_id)
      .maybeSingle();
    if (personError) throw personError;
    const typedPerson = person as PersonRow | null;
    if (!typedPerson || !typedPerson.contact_allowed || typedPerson.do_not_contact) {
      await stopSequenceForContactRestriction(sequence);
      await insertTimelineEvent({
        sequence,
        eventType: "recruitment_email_stopped",
        title: "Séquence email de recrutement arrêtée",
        description: "contact_not_allowed",
        metadata: { sequence_id: sequence.id, reason: "contact_not_allowed", source: "lot_9b_native_orchestrator" },
        idempotencyKey: `recruitment_email_stopped:${sequence.id}`
      });
      stopped += 1;
      continue;
    }

    const { data: steps, error: stepsError } = await supabase
      .from("recruitment_email_sequence_steps")
      .select("id,tenant_id,sequence_id,person_id,step_index,step_key,status,scheduled_at")
      .eq("sequence_id", sequence.id)
      .in("step_index", [1, 2]);
    if (stepsError) throw stepsError;
    const typedSteps = (steps ?? []) as StepRow[];
    const first = typedSteps.find((step) => step.step_index === 1);
    const second = typedSteps.find((step) => step.step_index === 2);

    if (!first) {
      if (await scheduleStep(sequence, 1, scheduledAt(sequence.sent_at!, 3))) scheduled += 1;
      continue;
    }
    if (first.status === "sent" && !second) {
      if (await scheduleStep(sequence, 2, scheduledAt(sequence.sent_at!, 7))) scheduled += 1;
    }
  }
  return { scheduled, stopped };
}

async function processDueSteps(limit = 25) {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.rpc("claim_due_recruitment_email_steps", {
    p_limit: Math.min(Math.max(limit, 1), 100)
  });
  if (error) throw error;
  const claimed = (data ?? []) as StepRow[];

  let sent = 0;
  let errors = 0;
  for (const step of claimed) {
    if (step.step_index !== 1 && step.step_index !== 2) {
      const { error: completeError } = await supabase.rpc("complete_recruitment_email_step", {
        p_step_id: step.id,
        p_success: false,
        p_provider_message_id: null,
        p_error: "Étape de relance invalide pour le worker Atlas."
      });
      if (completeError) throw completeError;
      errors += 1;
      continue;
    }

    const [{ data: sequence, error: sequenceError }, { data: person, error: personError }] = await Promise.all([
      supabase
        .from("recruitment_email_sequences")
        .select("id,email,status,lifecycle_status")
        .eq("id", step.sequence_id)
        .maybeSingle(),
      supabase
        .from("people")
        .select("id,display_name,contact_allowed,do_not_contact")
        .eq("id", step.person_id)
        .maybeSingle()
    ]);
    if (sequenceError) throw sequenceError;
    if (personError) throw personError;

    const typedPerson = person as PersonRow | null;
    const email = (sequence as { email?: string } | null)?.email;
    let result: Awaited<ReturnType<typeof sendRecruitmentFollowUpEmail>>;
    if (!typedPerson || !typedPerson.contact_allowed || typedPerson.do_not_contact || !email) {
      result = { success: false, error: "Contact non autorisé ou email manquant au moment de l’envoi." };
    } else {
      result = await sendRecruitmentFollowUpEmail({
        stepId: step.id,
        stepIndex: step.step_index,
        email,
        displayName: typedPerson.display_name
      });
    }

    const { error: completeError } = await supabase.rpc("complete_recruitment_email_step", {
      p_step_id: step.id,
      p_success: result.success,
      p_provider_message_id: result.success ? result.messageId : null,
      p_error: result.success ? null : result.error
    });
    if (completeError) throw completeError;
    if (result.success) sent += 1;
    else errors += 1;
  }

  return { claimed: claimed.length, sent, errors };
}

export async function runRecruitmentEmailOrchestration(input?: { prepareLimit?: number; claimLimit?: number }) {
  const prepared = await prepareFollowUps(input?.prepareLimit ?? 100);
  const processed = await processDueSteps(input?.claimLimit ?? 25);
  return {
    scheduled: prepared.scheduled,
    stopped: prepared.stopped,
    claimed: processed.claimed,
    sent: processed.sent,
    errors: processed.errors
  } satisfies RecruitmentOrchestrationSummary;
}
