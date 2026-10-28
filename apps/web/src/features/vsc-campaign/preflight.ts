/**
 * Pure, non-sending preflight guard for VendreSonCommerce.
 * Never trust tenant, sender, opt-out, or campaign state from the browser.
 * Server callers must load them from authoritative database records.
 */
import { VSC_SENDER, VSC_OFFER_END, type VscContact, type VscChannel } from "./policy";

export type VscPreflight = {
  tenantId: string;
  configuredTenantId: string;
  sender: string;
  channel: VscChannel;
  scheduledDate: string;
  contact: VscContact;
  campaignApproved: boolean;
  campaignEnabled: boolean;
  providerConfigured: boolean;
};

export type VscPreflightResult =
  | { allowed: true }
  | { allowed: false; reason: string };

export function validateVscPreflight(input: VscPreflight): VscPreflightResult {
  if (!input.configuredTenantId || input.tenantId !== input.configuredTenantId)
    return { allowed: false, reason: "tenant_mismatch" };
  if (input.sender !== VSC_SENDER) return { allowed: false, reason: "sender_mismatch" };
  if (!input.campaignApproved || !input.campaignEnabled)
    return { allowed: false, reason: "campaign_not_approved_or_enabled" };
  if (!input.providerConfigured) return { allowed: false, reason: "provider_not_configured" };
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(input.scheduledDate) || input.scheduledDate > VSC_OFFER_END)
    return { allowed: false, reason: "offer_expired_or_invalid_date" };
  const c = input.contact;
  if (c.doNotContact || c.replied || c.appointmentBooked || c.purchased)
    return { allowed: false, reason: "contact_stopped" };
  if (input.channel === "email" && (!c.email?.trim() || c.emailOptOut))
    return { allowed: false, reason: "email_unavailable_or_opted_out" };
  if (input.channel === "sms" && (!c.mobile?.trim() || c.smsOptOut))
    return { allowed: false, reason: "sms_unavailable_or_opted_out" };
  return { allowed: true };
}
