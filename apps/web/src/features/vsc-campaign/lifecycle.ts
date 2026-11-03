/**
 * VendreSonCommerce campaign state transition policy.
 * Pure functions: no persistence, no provider calls. The future worker must
 * perform atomic claims and reload contact status before dispatch.
 */
export type VscCampaignState = "draft" | "approved" | "active" | "paused" | "completed" | "cancelled";
export type VscDeliveryState = "scheduled" | "claimed" | "sent" | "failed" | "cancelled";

export type VscCampaignRecord = {
  tenantId: string;
  state: VscCampaignState;
  approvedBy: string | null;
  approvedAt: string | null;
  enabledAt: string | null;
};

export function mayActivateVscCampaign(
  record: VscCampaignRecord,
  configuredTenantId: string
): boolean {
  return Boolean(
    configuredTenantId &&
    record.tenantId === configuredTenantId &&
    record.state === "approved" &&
    record.approvedBy &&
    record.approvedAt
  );
}

export function shouldStopVscSequence(input: {
  replied: boolean;
  unsubscribed: boolean;
  doNotContact: boolean;
  appointmentBooked: boolean;
  purchased: boolean;
  campaignState: VscCampaignState;
}): boolean {
  return input.replied || input.unsubscribed || input.doNotContact ||
    input.appointmentBooked || input.purchased || input.campaignState !== "active";
}

export function mayClaimVscDelivery(input: {
  campaignState: VscCampaignState;
  deliveryState: VscDeliveryState;
  due: boolean;
  tenantMatches: boolean;
  stopped: boolean;
}): boolean {
  return input.campaignState === "active" &&
    input.deliveryState === "scheduled" &&
    input.due && input.tenantMatches && !input.stopped;
}
