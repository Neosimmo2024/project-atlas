export type WhatsAppTemplate = { id: string; label: string; body: string; expiresAt?: string };
export const WHATSAPP_TEMPLATES: WhatsAppTemplate[] = [
  {
    id: "lpgi-ormesson-20261015",
    label: "Invitation LPGI — Ormesson, 15 octobre",
    expiresAt: "2026-10-15T18:30:00+02:00",
    body: `Bonjour [Prénom], en tant qu’ambassadeur des Petits Génies de l’Immobilier, je vous invite à notre premier afterwork à Ormesson, ce jeudi 15 octobre à 18 h 30 au Golf d’Ormesson !

L’occasion de faire connaissance, d’échanger sur nos métiers et de créer des liens entre professionnels de l’immobilier, dans une ambiance conviviale.

Ce serait un plaisir de vous y retrouver 😊

👉 Inscription : https://event.lpgi.club/afterwork

Vous serez des nôtres ?`
  },
  { id: "followup", label: "Suivi d’un échange", body: "Bonjour [Prénom], je reviens vers vous à la suite de notre échange. Seriez-vous disponible pour en discuter ?" }
];
export function availableWhatsAppTemplates(now: number) {
  return WHATSAPP_TEMPLATES.filter((template) => !template.expiresAt || Date.parse(template.expiresAt) > now);
}
export function personalizeWhatsAppMessage(body: string, firstName: string) {
  const name = firstName.trim();
  return body.replaceAll("[Prénom]", name).replace(/^Bonjour ,/, "Bonjour,");
}
