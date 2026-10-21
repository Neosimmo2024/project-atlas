/** Local preparation only: no transport, storage, environment variables or send API. */
export const SMS_PILOT_MESSAGE = "AVENOR - Test technique NEOS IMMO. Ce message verifie la reception d'un SMS. Aucune relance automatique.";

export type SmsPilotPreview =
  | { status: "invalid"; message: string }
  | { status: "prepared"; recipient: string; content: string; characterCount: number; sent: false };

export function prepareSmsPilotPreview(phone: string): SmsPilotPreview {
  // Deliberately restricted to French +33 mobile syntax for the first personal test.
  // Syntax cannot establish ownership, deliverability or an active subscription.
  if (phone.length > 40 || !/^[+0-9 .()-]+$/.test(phone)) {
    return { status: "invalid", message: "Saisis un seul numéro mobile français, commençant par 06, 07 ou +33." };
  }
  const compact = phone.replace(/[ .()-]/g, "");
  const recipient = /^0[67][0-9]{8}$/.test(compact) ? `+33${compact.slice(1)}` : compact;
  if (!/^\+33[67][0-9]{8}$/.test(recipient)) {
    return { status: "invalid", message: "Saisis un seul numéro mobile français, commençant par 06, 07 ou +33." };
  }
  return { status: "prepared", recipient, content: SMS_PILOT_MESSAGE, characterCount: SMS_PILOT_MESSAGE.length, sent: false };
}
