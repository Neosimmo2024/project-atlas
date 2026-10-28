/**
 * Server-side OVH campaign transport for VendreSonCommerce.
 * Deliberately not wired to a route, scheduler or UI until the
 * database-backed approval and launch validation are complete.
 */
import { createOvhTransport, OVH_SENDER } from "@/services/ovh-connection";
import { validateVscPreflight, type VscPreflight } from "@/features/vsc-campaign/preflight";

import { isVscOfferCurrent } from "@/features/vsc-campaign/policy";
import { checkVscContactStop } from "@/services/vsc-contact-stop";
import { createVscUnsubscribeUrl } from "@/services/vsc-unsubscribe-token";

export type VscMail = {
  personId: string;
  recipient: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
};

export async function sendApprovedVscEmail(
  preflight: VscPreflight,
  mail: VscMail
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const check = validateVscPreflight(preflight);
  if (!check.allowed || preflight.channel !== "email")
    return { success: false, error: !check.allowed ? check.reason : "invalid_channel" };
  if (!isVscOfferCurrent(new Date())) return { success: false, error: "offer_expired" };
  const password = process.env.VSC_OVH_SMTP_PASSWORD;
  if (!password) return { success: false, error: "ovh_not_configured" };
  if (!mail.recipient || mail.recipient.trim().toLowerCase() !== preflight.contact.email?.trim().toLowerCase())
    return { success: false, error: "recipient_mismatch" };
  if (!mail.subject.trim() || !mail.text.trim())
    return { success: false, error: "empty_message" };
  let unsubscribeUrl: string;
  try {
    if ((await checkVscContactStop(preflight.tenantId, mail.personId, mail.recipient)).stopped)
      return { success: false, error: "contact_stopped_in_database" };
    unsubscribeUrl = createVscUnsubscribeUrl(preflight.tenantId, mail.personId);
  } catch { return { success: false, error: "contact_or_unsubscribe_check_unavailable" }; }
  const footer = `<p>Ne plus recevoir nos emails : <a href="${unsubscribeUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}">se désinscrire</a></p>`;
  const html = mail.html ? (/<\/body\s*>/i.test(mail.html)
    ? mail.html.replace(/<\/body\s*>/i, footer + "</body>") : mail.html + footer) : undefined;
  // Database and signing checks can cross midnight: recheck immediately before SMTP.
  if (!isVscOfferCurrent(new Date())) return { success: false, error: "offer_expired" };
  const transport = createOvhTransport(password);
  try {
    const result = await transport.sendMail({
      from: { name: "VendreSonCommerce", address: OVH_SENDER },
      to: mail.recipient,
      replyTo: OVH_SENDER,
      subject: mail.subject,
      text: mail.text + "\n\nNe plus recevoir nos emails : " + unsubscribeUrl,
      ...(html ? { html } : {})
    });
    return { success: true, messageId: result.messageId };
  } catch {
    return { success: false, error: "ovh_send_failed" };
  } finally {
    transport.close();
  }
}
