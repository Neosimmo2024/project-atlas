/**
 * VendreSonCommerce campaign policy.
 * Pure policy only: NO network calls, NO email/SMS dispatch, NO database mutations.
 * Must not be imported by the NEOS recruitment orchestrator.
 */
export const VSC_SENDER = "contact@vendresoncommerce.com";
export const VSC_OFFER_END = "2026-11-30";
export const VSC_PROMO_PRICE_HT = 79;
export const VSC_STANDARD_PRICE_HT = 159;

export type VscContact = {
  email?: string | null;
  mobile?: string | null;
  doNotContact: boolean;
  emailOptOut: boolean;
  smsOptOut: boolean;
  replied: boolean;
  appointmentBooked: boolean;
  purchased: boolean;
};

export type VscChannel = "email" | "sms";
export type VscStep = { channel: VscChannel; offsetDays: number; key: string };

export function vscCampaignSteps(contact: VscContact): VscStep[] {
  if (contact.doNotContact || contact.replied || contact.appointmentBooked || contact.purchased) return [];
  const email = Boolean(contact.email?.trim()) && !contact.emailOptOut;
  const sms = Boolean(contact.mobile?.trim()) && !contact.smsOptOut;
  if (email && sms) return [
    { channel: "email", offsetDays: 0, key: "offer" },
    { channel: "sms", offsetDays: 5, key: "sms-reminder" },
    { channel: "email", offsetDays: 20, key: "consideration" },
    { channel: "email", offsetDays: 40, key: "last-chance" }
  ];
  if (email) return [
    { channel: "email", offsetDays: 0, key: "offer" },
    { channel: "email", offsetDays: 20, key: "consideration" },
    { channel: "email", offsetDays: 40, key: "last-chance" }
  ];
  if (sms) return [
    { channel: "sms", offsetDays: 0, key: "sms-initial" },
    { channel: "sms", offsetDays: 15, key: "sms-followup-1" },
    { channel: "sms", offsetDays: 30, key: "sms-followup-2" },
    { channel: "sms", offsetDays: 45, key: "sms-followup-3" }
  ];
  return [];
}

export function vscEligibleSteps(contact: VscContact, startDate: string): Array<VscStep & { scheduledDate: string }> {
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(startDate)) throw new Error("Date invalide");
  const start = new Date(startDate + "T12:00:00Z");
  if (Number.isNaN(start.getTime()) || start.toISOString().slice(0, 10) !== startDate) throw new Error("Date invalide");
  return vscCampaignSteps(contact).flatMap((step) => {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + step.offsetDays);
    const scheduledDate = date.toISOString().slice(0, 10);
    // Do not advertise an expired promotional price.
    return scheduledDate <= VSC_OFFER_END ? [{ ...step, scheduledDate }] : [];
  });
}
