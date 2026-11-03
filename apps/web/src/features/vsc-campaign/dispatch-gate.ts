/**
 * Pure VSC send eligibility gate. The future dispatcher must call this
 * immediately before a provider request using freshly loaded database state.
 */
import { validateVscPreflight, type VscPreflight } from "./preflight";
import { mayClaimVscDelivery, type VscCampaignState, type VscDeliveryState } from "./lifecycle";

export function mayDispatchVscNow(input: {
  preflight: VscPreflight;
  campaignState: VscCampaignState;
  deliveryState: VscDeliveryState;
  due: boolean;
  tenantMatches: boolean;
  replyRecorded: boolean;
  idempotencyClaimed: boolean;
}): { allowed: boolean; reason?: string } {
  const check = validateVscPreflight(input.preflight);
  if (!check.allowed) return { allowed: false, reason: check.reason };
  if (input.replyRecorded) return { allowed: false, reason: "reply_recorded" };
  if (!input.idempotencyClaimed) return { allowed: false, reason: "claim_missing" };
  if (!mayClaimVscDelivery({
    campaignState: input.campaignState,
    deliveryState: input.deliveryState,
    due: input.due,
    tenantMatches: input.tenantMatches,
    stopped: false
  })) return { allowed: false, reason: "delivery_not_eligible" };
  return { allowed: true };
}
