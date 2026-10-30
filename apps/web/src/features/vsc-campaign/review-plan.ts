/**
 * Build a review-only plan for VendreSonCommerce.
 * Never sends or schedules a message in a provider.
 */
import { vscEligibleSteps, type VscContact } from "./policy";
import { shouldStopVscSequence, type VscCampaignState } from "./lifecycle";

export type VscLead = {
  id: string;
  tenantId: string;
  contact: VscContact;
  unsubscribed: boolean;
};

export type VscPlannedDelivery = {
  key: string;
  leadId: string;
  tenantId: string;
  channel: "email" | "sms";
  stepKey: string;
  scheduledDate: string;
  status: "draft";
};

export function buildVscReviewPlan(input: {
  leads: VscLead[];
  tenantId: string;
  startDate: string;
  campaignState: VscCampaignState;
}): VscPlannedDelivery[] {
  if (!input.tenantId) throw new Error("Tenant obligatoire");
  if (input.campaignState !== "draft" && input.campaignState !== "approved") {
    throw new Error("Planification réservée aux campagnes non activées");
  }
  const seen = new Set<string>();
  const plan: VscPlannedDelivery[] = [];
  for (const lead of input.leads) {
    if (lead.tenantId !== input.tenantId) continue;
    if (seen.has(lead.id)) continue;
    seen.add(lead.id);
    if (shouldStopVscSequence({
      replied: lead.contact.replied,
      unsubscribed: lead.unsubscribed,
      doNotContact: lead.contact.doNotContact,
      appointmentBooked: lead.contact.appointmentBooked,
      purchased: lead.contact.purchased,
      campaignState: "active"
    })) continue;
    for (const step of vscEligibleSteps(lead.contact, input.startDate)) {
      plan.push({
        key: [input.tenantId, lead.id, step.key, step.scheduledDate].join(":"),
        leadId: lead.id,
        tenantId: input.tenantId,
        channel: step.channel,
        stepKey: step.key,
        scheduledDate: step.scheduledDate,
        status: "draft"
      });
    }
  }
  return plan;
}
