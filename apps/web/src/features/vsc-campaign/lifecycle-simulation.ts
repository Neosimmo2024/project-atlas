/**
 * Non-sending VSC end-to-end simulation.
 * All data is fictitious. No provider calls, no database access.
 */
import { buildVscReviewPlan, type VscLead } from "./review-plan";
import { matchVscInboxReplies } from "./reply-matching";
import { shouldStopVscSequence } from "./lifecycle";

export function simulateVscCampaignLifecycle(input: {
  tenantId: string;
  startDate: string;
  leads: VscLead[];
}) {
  const drafts = buildVscReviewPlan({
    leads: input.leads, tenantId: input.tenantId,
    startDate: input.startDate, campaignState: "draft"
  });
  const firstEmail = drafts.find(step => step.channel === "email");
  if (!firstEmail) return { draftCount: drafts.length, replyMatched: false, pendingAfterReply: drafts.length };

  const lead = input.leads.find(x => x.id === firstEmail.leadId && x.tenantId === input.tenantId);
  if (!lead?.contact.email) throw new Error("Prospect fictif invalide");

  const outboundId = "<vsc-simulation@atlas.invalid>";
  const replies = matchVscInboxReplies({
    tenantId: input.tenantId,
    outbounds: [{
      tenantId: input.tenantId, campaignId: "simulation",
      personId: lead.id, recipientEmail: lead.contact.email,
      providerMessageId: outboundId
    }],
    envelopes: [{
      messageId: "<vsc-reply@atlas.invalid>",
      from: lead.contact.email, inReplyTo: outboundId, references: [],
      receivedAt: "2026-10-28T09:00:00Z"
    }]
  });

  const stopped = replies.length > 0 && shouldStopVscSequence({
    replied: true, unsubscribed: false, doNotContact: false,
    appointmentBooked: false, purchased: false, campaignState: "active"
  });
  return {
    draftCount: drafts.length,
    replyMatched: replies.length === 1,
    pendingAfterReply: stopped ? drafts.filter(x => x.leadId !== lead.id).length : drafts.length
  };
}
