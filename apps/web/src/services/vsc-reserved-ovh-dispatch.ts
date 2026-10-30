/** Disabled by default. No endpoint, UI or scheduler calls this adapter. */
import { createOvhTransport, OVH_SENDER } from "@/services/ovh-connection";
import { createVscUnsubscribeUrl } from "@/services/vsc-unsubscribe-token";
import { reserveVscEmail, beginVscEmail, refreshVscEmail, releaseVscEmail, recordVscEmailResult, type VscEmailReservation, type VscReservedPayload } from "@/services/vsc-email-reservations";
import { isVscOfferCurrent } from "@/features/vsc-campaign/policy";
import { classifyVscSmtpReceipt, classifyVscSmtpError } from "@/features/vsc-campaign/smtp-outcome";
export type VscDispatchResult = { state: "disabled" | "not_eligible" | "blocked" | "sent" | "rejected" | "review_required"; reason?: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fields = ["deliveryId", "campaignId", "personId", "recipient", "subject", "text", "messageId"] as const;
function samePayload(a: VscReservedPayload, b: VscReservedPayload | null): boolean {
  return !!b && fields.every(field => a[field] === b[field]);
}
function validReservation(value: VscEmailReservation, id: string) {
  const p = value?.payload;
  return value?.deliveryId === id && UUID.test(value.claimToken) && p && p.deliveryId === id
    && UUID.test(p.personId) && UUID.test(p.campaignId) && typeof p.recipient === "string" && p.recipient.length <= 320
    && !/[\u0000-\u001f\u007f]/.test(p.recipient)
    && /^[^\s@,;<>"\\]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,63}$/.test(p.recipient)
    && typeof p.subject === "string" && p.subject.trim().length > 0 && p.subject.length <= 200 && !/[\u0000-\u001f\u007f]/.test(p.subject)
    && typeof p.text === "string" && p.text.trim().length > 0 && p.text.length <= 6000 && !p.text.includes("\u0000")
    && p.messageId === `<vsc-${id}@vendresoncommerce.com>`;
}
export async function dispatchReservedVscEmail(tenantId: string, deliveryId: string): Promise<VscDispatchResult> {
  if (process.env.VSC_EMAIL_DISPATCH_ENABLED !== "true") return { state: "disabled" };
  let reservation: VscEmailReservation | null;
  try { reservation = await reserveVscEmail(tenantId, deliveryId); }
  catch { return { state: "review_required", reason: "reservation_unconfirmed" }; }
  if (!reservation) return { state: "not_eligible" };
  const token = reservation.claimToken;
  let unsubscribeUrl: string;
  let transport: ReturnType<typeof createOvhTransport>;
  try {
    if (!validReservation(reservation, deliveryId) || !isVscOfferCurrent(new Date())) throw new Error("Invalid reservation");
    const password = process.env.VSC_OVH_SMTP_PASSWORD;
    if (!password) throw new Error("Missing configuration");
    unsubscribeUrl = createVscUnsubscribeUrl(tenantId, reservation.payload.personId);
    // Non-pooled transport: constructing it does not submit any message.
    transport = createOvhTransport(password);
  } catch {
    try { return await releaseVscEmail(tenantId, deliveryId, token) ? { state: "blocked", reason: "preparation_failed" } : { state: "review_required", reason: "release_unconfirmed" }; }
    catch { return { state: "review_required", reason: "release_unconfirmed" }; }
  }
  async function persist(outcome: "sent" | "rejected" | "unknown", reason?: string): Promise<VscDispatchResult> {
    try {
      const recorded = await recordVscEmailResult(tenantId, deliveryId, token, outcome, outcome === "sent" ? reservation!.payload.messageId : undefined);
      if (!recorded) return { state: "review_required", reason: "result_unrecorded" };
      return outcome === "unknown" ? { state: "review_required", reason: "smtp_acceptance_unknown" } : { state: outcome, ...(reason ? { reason } : {}) };
    } catch { return { state: "review_required", reason: "result_unconfirmed" }; }
  }
  try {
    let begun: VscReservedPayload | null;
    try { begun = await beginVscEmail(tenantId, deliveryId, token); }
    catch { return { state: "review_required", reason: "begin_unconfirmed" }; }
    if (!begun) return { state: "blocked", reason: "start_refused" };
    try {
      const fresh = await refreshVscEmail(tenantId, deliveryId, token);
      if (!samePayload(reservation.payload, begun) || !samePayload(reservation.payload, fresh)
        || process.env.VSC_EMAIL_DISPATCH_ENABLED !== "true" || !isVscOfferCurrent(new Date())) {
        const result = await persist("rejected", "stopped_before_smtp");
        return result.state === "rejected" ? { state: "blocked", reason: "stopped_before_smtp" } : result;
      }
    } catch {
      const result = await persist("rejected", "guard_unavailable_before_smtp");
      return result.state === "rejected" ? { state: "blocked", reason: "guard_unavailable_before_smtp" } : result;
    }
    const payload = reservation.payload;
    let outcome: "sent" | "rejected" | "unknown";
    try {
      const receipt = await transport.sendMail({
        from: { name: "VendreSonCommerce", address: OVH_SENDER }, replyTo: OVH_SENDER,
        to: { name: "", address: payload.recipient }, envelope: { from: OVH_SENDER, to: [payload.recipient] },
        messageId: payload.messageId, subject: payload.subject,
        text: payload.text + "\n\nNe plus recevoir nos emails : " + unsubscribeUrl
      });
      outcome = classifyVscSmtpReceipt(receipt, payload.recipient, payload.messageId);
    } catch (error) { outcome = classifyVscSmtpError(error); }
    return await persist(outcome);
  } finally {
    // Closing a successful connection must never turn a persisted receipt into a retry signal.
    try { transport.close(); } catch { /* No retry, no sensitive provider log. */ }
  }
}
