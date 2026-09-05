import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd(), "../..");
const inbound = readFileSync(resolve(root, "apps/web/src/services/recruitment-inbound-replies.ts"), "utf8");
const route = readFileSync(resolve(root, "apps/web/src/app/api/internal/recruitment-email/inbound/route.ts"), "utf8");
const brevo = readFileSync(resolve(root, "apps/web/src/services/brevo.ts"), "utf8");
const card = readFileSync(resolve(root, "apps/web/src/components/people/recruitment-email-sequence-card.tsx"), "utf8");
const pipeline = readFileSync(resolve(root, "apps/web/src/repositories/recruitment-pipeline.ts"), "utf8");

describe("lot 9D candidate reply detection", () => {
  it("routes replies through the dedicated inbound domain without changing the sender", () => {
    expect(brevo).toContain("BREVO_RECRUITMENT_INBOUND_DOMAIN");
    expect(brevo).toContain("recrutement+${sequenceId}@${domain}");
    expect(brevo).toContain("replyTo:");
    expect(brevo).toContain("Idempotency-Key");
  });

  it("correlates inbound replies with provider message ids and recipient fallback", () => {
    expect(inbound).toContain("InReplyTo");
    expect(inbound).toContain("provider_message_id");
    expect(inbound).toContain("recruitment_email_sequence_steps");
    expect(inbound).toContain("sequenceIdFromRecipients");
  });

  it("stops active sequences, lets existing triggers cancel future steps and deduplicates events", () => {
    expect(inbound).toContain('stop_reason: "candidate_reply"');
    expect(inbound).toContain('status: "stopped"');
    expect(inbound).toContain('lifecycle_status: "stopped"');
    expect(inbound).toContain("recruitment_email_reply:");
    expect(inbound).toContain('onConflict: "tenant_id,idempotency_key"');
  });

  it("does not auto-stop when the reply sender differs from the candidate email", () => {
    expect(inbound).toContain("sender_mismatch");
    expect(inbound).toContain("reviewRequired");
    expect(inbound).toContain("L’expéditeur de la réponse ne correspond pas à l’adresse du candidat");
  });

  it("protects the Brevo inbound endpoint with a dedicated secret header", () => {
    expect(inbound).toContain("BREVO_INBOUND_WEBHOOK_SECRET");
    expect(inbound).toContain("x-atlas-brevo-webhook-secret");
    expect(inbound).toContain("timingSafeEqual");
    expect(route).toContain("isAuthorizedBrevoInboundWebhook(request)");
    expect(route).toContain("status: 401");
  });

  it("shows a human-readable candidate reply reason in person and pipeline UX", () => {
    expect(card).toContain('reason === "candidate_reply"');
    expect(card).toContain("Réponse du candidat");
    expect(pipeline).toContain('sequence.stop_reason === "candidate_reply"');
    expect(pipeline).toContain("Réponse reçue · séquence arrêtée");
  });
});
