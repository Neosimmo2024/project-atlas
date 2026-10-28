/** Review-only plain-text copy. No approval, scheduling or provider calls. */
import { VSC_PROMO_PRICE_HT, VSC_STANDARD_PRICE_HT } from "./policy";
export const VSC_EMAIL_CONTENT_STEPS = ["offer", "consideration", "last-chance"] as const;
export type VscEmailStep = typeof VSC_EMAIL_CONTENT_STEPS[number];
export type VscEmailMessage = { stepKey: VscEmailStep; subject: string; text: string };
export type VscEmailContent = { version: 1; messages: VscEmailMessage[] };
export function defaultVscEmailContent(): VscEmailContent {
  const offer = `${VSC_PROMO_PRICE_HT} € HT au lieu de ${VSC_STANDARD_PRICE_HT} € HT`;
  const signature = "L’équipe VendreSonCommerce\ncontact@vendresoncommerce.com";
  return { version: 1, messages: [
    { stepKey: "offer", subject: `Votre annonce jusqu’à la vente à ${VSC_PROMO_PRICE_HT} € HT`, text: `Bonjour,\n\nVous vendez un commerce ou préparez sa cession ?\n\nAvec VendreSonCommerce, votre annonce reste publiée jusqu’à la vente. Notre offre est actuellement de ${offer}, jusqu’au 30 novembre 2026.\n\nSi vous souhaitez en savoir plus, répondez simplement à cet email en nous parlant de votre projet.\n\nBien cordialement,\n${signature}` },
    { stepKey: "consideration", subject: "Votre projet de vente de commerce : où en êtes-vous ?", text: `Bonjour,\n\nJe reviens vers vous au sujet de votre éventuel projet de vente de commerce.\n\nL’offre VendreSonCommerce est de ${offer}, avec une annonce publiée jusqu’à la vente. Cette promotion est valable jusqu’au 30 novembre 2026.\n\nVotre projet est-il toujours d’actualité ? Vous pouvez nous répondre directement : nous pourrons vous expliquer comment publier votre annonce.\n\nBien cordialement,\n${signature}` },
    { stepKey: "last-chance", subject: `Un dernier point sur votre annonce à ${VSC_PROMO_PRICE_HT} € HT`, text: `Bonjour,\n\nUn dernier message concernant l’offre VendreSonCommerce : ${offer} pour une annonce publiée jusqu’à la vente. La promotion prend fin le 30 novembre 2026.\n\nSi vous envisagez de céder votre commerce, répondez à cet email pour échanger sur la publication de votre annonce.\n\nBien cordialement,\n${signature}` }
  ] };
}
export function validateVscEmailContent(value: unknown): VscEmailContent {
  const content = value as Partial<VscEmailContent> | null;
  if (!content || content.version !== 1 || !Array.isArray(content.messages) || content.messages.length !== 3)
    throw new Error("Les trois textes email sont obligatoires.");
  const messages = VSC_EMAIL_CONTENT_STEPS.map(stepKey => {
    const matches = content.messages!.filter(message => message?.stepKey === stepKey);
    const message = matches[0];
    if (matches.length !== 1 || typeof message.subject !== "string" || !message.subject.trim()
      || message.subject.trim().length > 200 || /[\r\n\u0000]/.test(message.subject)
      || typeof message.text !== "string" || !message.text.trim() || message.text.trim().length > 6000 || message.text.includes("\u0000"))
      throw new Error("Chaque email doit avoir un objet valide et un texte de 6 000 caractères maximum.");
    return { stepKey, subject: message.subject.trim(), text: message.text.trim() };
  });
  return { version: 1, messages };
}
