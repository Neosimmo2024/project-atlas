export const WHATSAPP_EVENTS = ["consent_granted", "consent_revoked", "sent", "replied"] as const;
export type WhatsAppEvent = typeof WHATSAPP_EVENTS[number];
export const WHATSAPP_LABELS: Record<WhatsAppEvent, string> = {
  consent_granted: "Accord WhatsApp enregistré", consent_revoked: "Ne plus relancer sur WhatsApp",
  sent: "Message WhatsApp envoyé", replied: "Réponse WhatsApp reçue"
};
export function normalizeWhatsAppPhone(value: string | null) {
  if (!value || !/^[+\d\s().-]+$/.test(value)) return null;
  let number = value.replace(/[\s().-]/g, "");
  if (number.startsWith("00")) number = `+${number.slice(2)}`;
  if (/^0[1-9]\d{8}$/.test(number)) number = `+33${number.slice(1)}`;
  if (!/^\+[1-9]\d{7,14}$/.test(number)) return null;
  return number.slice(1);
}
export function whatsappLink(phone: string | null, message: string) {
  const number = normalizeWhatsAppPhone(phone);
  return number && message.trim() ? `https://wa.me/${number}?text=${encodeURIComponent(message.trim())}` : null;
}
