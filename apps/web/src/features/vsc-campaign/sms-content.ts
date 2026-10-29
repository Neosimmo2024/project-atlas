/** Review-only SMS copy and transport-size estimate. No provider or database access. */
import { isVscCalendarDate, vscEligibleSteps, VSC_OFFER_END } from "./policy";

export const VSC_SMS_STEPS = ["sms-reminder", "sms-initial", "sms-followup-1", "sms-followup-2", "sms-followup-3"] as const;
export type VscSmsStep = typeof VSC_SMS_STEPS[number];
export type VscSmsMessage = { stepKey: VscSmsStep; text: string };
export const VSC_SMS_STOP_PLACEHOLDER = "[numero STOP VSC]";

export function defaultVscSmsContent(): VscSmsMessage[] {
  const offer = "79 EUR HT au lieu de 159 EUR HT, annonce jusqu'a la vente. Offre jusqu'au 30 novembre 2026.";
  const endings = `vendresoncommerce.com\nSTOP au ${VSC_SMS_STOP_PLACEHOLDER}`;
  return [
    { stepKey: "sms-reminder", text: `VendreSonCommerce : suite a notre email, votre projet de vente de commerce est-il toujours d'actualite ? ${offer}\n${endings}` },
    { stepKey: "sms-initial", text: `Vous vendez votre commerce ? VendreSonCommerce propose ${offer}\n${endings}` },
    { stepKey: "sms-followup-1", text: `VendreSonCommerce : ou en est votre projet de cession ? ${offer}\n${endings}` },
    { stepKey: "sms-followup-2", text: `Votre commerce est toujours a vendre ? Retrouvez l'offre VendreSonCommerce : ${offer}\n${endings}` },
    { stepKey: "sms-followup-3", text: `Un dernier point sur votre projet de vente avec VendreSonCommerce. ${offer}\n${endings}` }
  ];
}

// GSM 03.38 default alphabet; extension characters consume two septets.
const GSM_BASIC = new Set(Array.from("@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"));
const GSM_EXTENDED = new Set(Array.from("\f^{}\\[~]|€"));
export function estimateVscSms(text: string) {
  const characters = Array.from(text);
  const gsm = characters.every(char => GSM_BASIC.has(char) || GSM_EXTENDED.has(char));
  const units = gsm ? characters.reduce((n, char) => n + (GSM_EXTENDED.has(char) ? 2 : 1), 0) : text.length;
  const single = gsm ? 160 : 70, multipart = gsm ? 153 : 67;
  // Pack whole characters: neither GSM escapes nor UTF-16 pairs may straddle a segment.
  let segments = units ? 1 : 0;
  if (units > single) {
    segments = 1; let used = 0;
    for (const char of characters) {
      const size = gsm ? (GSM_EXTENDED.has(char) ? 2 : 1) : char.length;
      if (used + size > multipart) { segments++; used = 0; }
      used += size;
    }
  }
  return { encoding: gsm ? "GSM-7" as const : "Unicode" as const, units, segments };
}

export function previewVscSms(input: { startDate: string; today: string; hasEmail: boolean; messages: VscSmsMessage[] }) {
  if (!isVscCalendarDate(input.startDate) || !isVscCalendarDate(input.today) || input.startDate < input.today || input.startDate > VSC_OFFER_END)
    throw new Error("Choisissez une date entre aujourd'hui et le 30 novembre 2026.");
  if (!Array.isArray(input.messages) || input.messages.length !== VSC_SMS_STEPS.length)
    throw new Error("Les cinq propositions SMS sont obligatoires.");
  const messages = VSC_SMS_STEPS.map(stepKey => {
    const matches = input.messages.filter(message => message?.stepKey === stepKey);
    if (matches.length !== 1 || typeof matches[0].text !== "string" || !matches[0].text.trim() || matches[0].text.length > 2000 || /[\u0000-\u0008\u000b\u000e-\u001f\u007f]/.test(matches[0].text))
      throw new Error("Chaque proposition SMS doit contenir un texte valide de 2 000 caractères maximum.");
    return { stepKey, text: matches[0].text.trim() };
  });
  return vscEligibleSteps({ email: input.hasEmail ? "example@fixture.invalid" : null, mobile: "0600000000", doNotContact: false, emailOptOut: false, smsOptOut: false, replied: false, appointmentBooked: false, purchased: false }, input.startDate)
    .filter(step => step.channel === "sms").map(step => {
      const message = messages.find(message => message.stepKey === step.key)!;
      return { stepKey: message.stepKey, scheduledDate: step.scheduledDate, text: message.text, ...estimateVscSms(message.text) };
    });
}
