import "server-only";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { escapedReplyHtml } from "@/features/mailbox/reply-draft";
import type { TenantContext } from "@/types/domain";

type Input = { action: "save" | "send"; body: string; revision: number; confirmation?: string };
const senderEmail = "renato.ponzio@neos-immo.com";

export async function reviewReply(ctx: TenantContext, taskId: string, input: Input) {
  if (!["owner", "admin"].includes(ctx.role)) throw new Error("REPLY_FORBIDDEN");
  if (!input.body.trim() || input.body.length > 10000 || !Number.isSafeInteger(input.revision) || input.revision < 0) throw new Error("REPLY_INVALID");
  const db = createSupabaseServiceRoleClient();
  const found = await db.from("tasks").select("id,person_id,metadata")
    .eq("tenant_id", ctx.tenantId).eq("id", taskId).is("deleted_at", null)
    .contains("metadata", { source: "recruitment_candidate_reply" }).maybeSingle();
  if (found.error || !found.data) throw new Error("REPLY_NOT_FOUND");
  const task = found.data;
  const meta = task.metadata as Record<string, unknown>;
  const status = meta.reply_status ?? "draft";
  const revision = Number(meta.reply_revision ?? 0);
  if (status !== "draft" || revision !== input.revision) throw new Error("REPLY_LOCKED");
  if (input.action === "send" && input.confirmation !== "approve_exact_reply") throw new Error("REPLY_NOT_APPROVED");
  const subject = `Re: ${String(meta.subject ?? "NEOS IMMO").replace(/^(Re:\s*)+/i, "").replace(/[\r\n]/g, " ").slice(0, 200)}`;

  // Resolve the recipient from the verified inbound sequence, never from client input.
  const sequence = await db.from("recruitment_email_sequences").select("email,lifecycle_status")
    .eq("tenant_id", ctx.tenantId).eq("id", String(meta.sequence_id)).eq("person_id", task.person_id).maybeSingle();
  if (sequence.error || !sequence.data || ! ["stopped", "completed"].includes(sequence.data.lifecycle_status)) throw new Error("REPLY_SEQUENCE_NOT_STOPPED");
  const to = sequence.data.email;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error("REPLY_INVALID_RECIPIENT");
  if (input.action === "send") {
    const person = await db.from("people").select("contact_allowed,do_not_contact").eq("tenant_id", ctx.tenantId).eq("id", task.person_id).maybeSingle();
    if (person.error || !person.data?.contact_allowed || person.data.do_not_contact) throw new Error("REPLY_CONTACT_BLOCKED");
    if (!process.env.BREVO_API_KEY) throw new Error("REPLY_UNCONFIGURED");
  }
  const next = { ...meta, suggested_reply: input.body.trim(), reply_revision: revision + 1,
    reply_status: input.action === "save" ? "draft" : "sending",
    reply_reviewed_by: ctx.userId, reply_reviewed_at: new Date().toISOString() };
  let claim = db.from("tasks").update({ metadata: next }).eq("tenant_id", ctx.tenantId).eq("id", taskId).is("deleted_at", null);
  claim = meta.reply_revision === undefined ? claim.is("metadata->>reply_revision", null) : claim.contains("metadata", { reply_revision: revision, reply_status: "draft" });
  const claimed = await claim.select("id").maybeSingle();
  if (claimed.error || !claimed.data) throw new Error("REPLY_LOCKED");
  if (input.action === "save") return { status: "draft", revision: revision + 1 };

  let outcome = "unknown";
  let messageId: string | null = null;
  try {
    const reference = String(meta.inbound_message_id ?? "");
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST", headers: { "api-key": process.env.BREVO_API_KEY!, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ sender: { name: "Renato Ponzio — NEOS IMMO", email: senderEmail },
        to: [{ email: to }], replyTo: { email: senderEmail, name: "Renato Ponzio" }, subject,
        textContent: input.body.trim(), htmlContent: escapedReplyHtml(input.body.trim()),
        headers: { "Idempotency-Key": `atlas-reviewed-reply:${taskId}`,
          ...(/^[^\r\n]{1,500}$/.test(reference) ? { "In-Reply-To": reference, References: reference } : {}) } }),
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000)
    });
    const result = await response.json().catch(() => ({})) as { messageId?: string };
    if (response.status === 201 && result.messageId) { outcome = "sent"; messageId = result.messageId; }
    else if ([400, 401, 402, 403, 422, 429].includes(response.status)) outcome = "rejected";
  } catch { /* Unknown outcome is locked for manual reconciliation, never retried. */ }
  const saved = await db.from("tasks").update({ metadata: { ...next, reply_status: outcome, reply_provider_message_id: messageId,
    reply_sent_at: outcome === "sent" ? new Date().toISOString() : null },
    ...(outcome === "sent" ? { status: "completed", completed_at: new Date().toISOString() } : {}) }).eq("tenant_id", ctx.tenantId).eq("id", taskId);
  if (saved.error) throw new Error("REPLY_RESULT_UNCERTAIN");
  return { status: outcome, revision: revision + 1 };
}
