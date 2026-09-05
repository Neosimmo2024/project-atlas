import { timingSafeEqual } from "node:crypto";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

type Mailbox = { Address?: string | null; Name?: string | null };
type Recipient = Mailbox | string;

export type BrevoInboundEmail = {
  MessageId?: string | null;
  InReplyTo?: string | null;
  From?: Mailbox | null;
  To?: Recipient[] | null;
  Recipients?: Recipient[] | null;
  SentAtDate?: string | null;
  Subject?: string | null;
  ExtractedMarkdownMessage?: string | null;
};

export type BrevoInboundPayload = { items?: BrevoInboundEmail[] | null };

type SequenceRow = {
  id: string;
  tenant_id: string;
  person_id: string;
  email: string;
  status: "pending" | "sent" | "error" | "stopped";
  lifecycle_status: "idle" | "scheduled" | "running" | "completed" | "stopped" | "error";
  provider_message_id: string | null;
};

export type InboundReplySummary = {
  processed: number;
  stopped: number;
  duplicates: number;
  unmatched: number;
  reviewRequired: number;
};

const webhookHeader = "x-atlas-brevo-webhook-secret";

function configuredWebhookSecret() {
  const value = process.env.BREVO_INBOUND_WEBHOOK_SECRET?.trim();
  return value && value.length >= 32 ? value : null;
}

export function isAuthorizedBrevoInboundWebhook(request: Request) {
  const expected = configuredWebhookSecret();
  const provided = request.headers.get(webhookHeader)?.trim() ?? "";
  if (!expected || provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

function messageIdVariants(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return [];
  const unwrapped = trimmed.startsWith("<") && trimmed.endsWith(">") ? trimmed.slice(1, -1) : trimmed;
  return Array.from(new Set([trimmed, `<${unwrapped}>`, unwrapped]));
}

function addressOf(recipient: Recipient) {
  return typeof recipient === "string" ? recipient : recipient.Address ?? "";
}

function sequenceIdFromRecipients(item: BrevoInboundEmail) {
  const recipients = [...(item.To ?? []), ...(item.Recipients ?? [])];
  for (const recipient of recipients) {
    const address = addressOf(recipient).trim();
    const match = address.match(/^recrutement\+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@/i);
    if (match?.[1]) return match[1];
  }
  return null;
}

async function getSequenceById(id: string): Promise<SequenceRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("recruitment_email_sequences")
    .select("id,tenant_id,person_id,email,status,lifecycle_status,provider_message_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as SequenceRow | null;
}

async function findSequence(item: BrevoInboundEmail): Promise<SequenceRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const variants = messageIdVariants(item.InReplyTo);
  if (variants.length > 0) {
    const { data: direct, error: directError } = await supabase
      .from("recruitment_email_sequences")
      .select("id,tenant_id,person_id,email,status,lifecycle_status,provider_message_id")
      .in("provider_message_id", variants)
      .limit(1)
      .maybeSingle();
    if (directError) throw directError;
    if (direct) return direct as SequenceRow;

    const { data: step, error: stepError } = await supabase
      .from("recruitment_email_sequence_steps")
      .select("sequence_id")
      .in("provider_message_id", variants)
      .limit(1)
      .maybeSingle();
    if (stepError) throw stepError;
    if (step?.sequence_id) return getSequenceById(step.sequence_id as string);
  }

  const sequenceId = sequenceIdFromRecipients(item);
  return sequenceId ? getSequenceById(sequenceId) : null;
}

function eventKey(messageId: string) {
  return `recruitment_email_reply:${messageId.trim()}`;
}

async function eventAlreadyProcessed(sequence: SequenceRow, messageId: string) {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("timeline_events")
    .select("id")
    .eq("tenant_id", sequence.tenant_id)
    .eq("idempotency_key", eventKey(messageId))
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

function replyExcerpt(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, 4000) : null;
}

async function insertReplyEvent(input: {
  sequence: SequenceRow;
  item: BrevoInboundEmail;
  title: string;
  description: string;
  reason: "candidate_reply" | "sender_mismatch";
}) {
  const messageId = input.item.MessageId!.trim();
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.from("timeline_events").upsert({
    tenant_id: input.sequence.tenant_id,
    event_type: input.reason === "candidate_reply" ? "recruitment_email_stopped" : "recruitment_email_error",
    title: input.title,
    description: input.description,
    occurred_at: new Date().toISOString(),
    created_by: null,
    person_id: input.sequence.person_id,
    source_type: "person",
    source_id: input.sequence.person_id,
    metadata: {
      sequence_id: input.sequence.id,
      reason: input.reason,
      inbound_message_id: messageId,
      in_reply_to: input.item.InReplyTo ?? null,
      from: input.item.From?.Address ?? null,
      subject: input.item.Subject ?? null,
      sent_at: input.item.SentAtDate ?? null,
      reply_excerpt: replyExcerpt(input.item.ExtractedMarkdownMessage),
      source: "brevo_inbound_parsing"
    },
    visibility: "tenant",
    idempotency_key: eventKey(messageId)
  }, { onConflict: "tenant_id,idempotency_key", ignoreDuplicates: true });
  if (error) throw error;
}

async function stopSequenceForCandidateReply(sequence: SequenceRow) {
  if (sequence.lifecycle_status === "stopped" || sequence.lifecycle_status === "completed") return false;
  const supabase = createSupabaseServiceRoleClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("recruitment_email_sequences")
    .update({
      status: "stopped",
      lifecycle_status: "stopped",
      next_action_at: null,
      stopped_at: now,
      stop_reason: "candidate_reply"
    })
    .eq("id", sequence.id)
    .neq("lifecycle_status", "stopped")
    .neq("lifecycle_status", "completed");
  if (error) throw error;
  return true;
}

export async function processBrevoInboundReplies(payload: BrevoInboundPayload): Promise<InboundReplySummary> {
  const summary: InboundReplySummary = { processed: 0, stopped: 0, duplicates: 0, unmatched: 0, reviewRequired: 0 };
  const items = Array.isArray(payload?.items) ? payload.items : [];

  for (const item of items) {
    const messageId = item.MessageId?.trim();
    const from = item.From?.Address?.trim().toLowerCase();
    if (!messageId || !from) {
      summary.unmatched += 1;
      continue;
    }

    const sequence = await findSequence(item);
    if (!sequence) {
      summary.unmatched += 1;
      continue;
    }

    if (await eventAlreadyProcessed(sequence, messageId)) {
      summary.duplicates += 1;
      continue;
    }

    if (sequence.email.trim().toLowerCase() !== from) {
      await insertReplyEvent({
        sequence,
        item,
        title: "Réponse email à vérifier",
        description: "L’expéditeur de la réponse ne correspond pas à l’adresse du candidat.",
        reason: "sender_mismatch"
      });
      summary.processed += 1;
      summary.reviewRequired += 1;
      continue;
    }

    const stopped = await stopSequenceForCandidateReply(sequence);
    await insertReplyEvent({
      sequence,
      item,
      title: stopped ? "Réponse candidat reçue — séquence arrêtée" : "Réponse candidat reçue",
      description: stopped ? "Réponse du candidat : les relances futures sont annulées." : "Réponse reçue après la fin ou l’arrêt de la séquence.",
      reason: "candidate_reply"
    });
    summary.processed += 1;
    if (stopped) summary.stopped += 1;
  }

  return summary;
}
