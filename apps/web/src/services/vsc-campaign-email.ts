/**
 * Server-side OVH campaign transport for VendreSonCommerce.
 * Deliberately not wired to a route, scheduler or UI until the
 * database-backed approval and opt-out checks are implemented.
 */
import { createOvhTransport, OVH_SENDER } from "@/services/ovh-connection";
import { validateVscPreflight, type VscPreflight } from "@/features/vsc-campaign/preflight";

export type VscMail = {
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
  const password = process.env.VSC_OVH_SMTP_PASSWORD;
  if (!password) return { success: false, error: "ovh_not_configured" };
  if (!mail.recipient || mail.recipient.trim().toLowerCase() !== preflight.contact.email?.trim().toLowerCase())
    return { success: false, error: "recipient_mismatch" };
  if (!mail.subject.trim() || !mail.text.trim())
    return { success: false, error: "empty_message" };
  const transport = createOvhTransport(password);
  try {
    const result = await transport.sendMail({
      from: { name: "VendreSonCommerce", address: OVH_SENDER },
      to: mail.recipient,
      replyTo: OVH_SENDER,
      subject: mail.subject,
      text: mail.text,
      ...(mail.html ? { html: mail.html } : {})
    });
    return { success: true, messageId: result.messageId };
  } catch {
    return { success: false, error: "ovh_send_failed" };
  } finally {
    transport.close();
  }
}
