/**
 * VendreSonCommerce approval and activation workflow is intentionally
 * NOT exposed to a public route until migration/RLS/integration QA passes.
 * This module provides validation of the intended transition only.
 */
import type { VscCampaignRecord } from "./lifecycle";
import { mayActivateVscCampaign } from "./lifecycle";

export type VscActivationDecision =
  | { allowed: true; nextState: "active" }
  | { allowed: false; reason: string };

export function decideVscActivation(input: {
  campaign: VscCampaignRecord;
  configuredTenantId: string;
  smtpVerified: boolean;
  imapVerified: boolean;
  unsubscribeReady: boolean;
  complianceReviewed: boolean;
  userConfirmedLaunch: boolean;
}): VscActivationDecision {
  if (!mayActivateVscCampaign(input.campaign, input.configuredTenantId))
    return { allowed: false, reason: "campaign_not_approved" };
  if (!input.smtpVerified || !input.imapVerified)
    return { allowed: false, reason: "mailbox_not_verified" };
  if (!input.unsubscribeReady)
    return { allowed: false, reason: "unsubscribe_not_ready" };
  if (!input.complianceReviewed)
    return { allowed: false, reason: "compliance_not_reviewed" };
  if (!input.userConfirmedLaunch)
    return { allowed: false, reason: "launch_not_confirmed" };
  return { allowed: true, nextState: "active" };
}
