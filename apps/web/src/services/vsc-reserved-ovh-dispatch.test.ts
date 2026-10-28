import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { reserve, begin, refresh, release, record, factory, sendMail, close, unsubscribe } = vi.hoisted(() => ({ reserve: vi.fn(), begin: vi.fn(), refresh: vi.fn(), release: vi.fn(), record: vi.fn(), factory: vi.fn(), sendMail: vi.fn(), close: vi.fn(), unsubscribe: vi.fn() }));
vi.mock("@/services/vsc-email-reservations", () => ({ reserveVscEmail: reserve, beginVscEmail: begin, refreshVscEmail: refresh, releaseVscEmail: release, recordVscEmailResult: record }));
vi.mock("@/services/ovh-connection", () => ({ OVH_SENDER: "contact@vendresoncommerce.com", createOvhTransport: factory }));
vi.mock("@/services/vsc-unsubscribe-token", () => ({ createVscUnsubscribeUrl: unsubscribe }));
import { dispatchReservedVscEmail } from "./vsc-reserved-ovh-dispatch";
const tenant = "20000000-0000-0000-0000-000000000001", id = "30000000-0000-0000-0000-000000000001", token = "40000000-0000-0000-0000-000000000001";
const payload = { deliveryId: id, campaignId: "50000000-0000-0000-0000-000000000001", personId: "60000000-0000-0000-0000-000000000001", recipient: "shop@fixture.invalid", subject: "Fixture", text: "TEST only", messageId: `<vsc-${id}@vendresoncommerce.com>` };
describe("Disabled-by-default reserved OVH adapter", () => {
  beforeEach(() => {
    vi.resetAllMocks(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-28T12:00:00Z"));
    vi.stubEnv("VSC_EMAIL_DISPATCH_ENABLED", "true"); vi.stubEnv("VSC_OVH_SMTP_PASSWORD", "synthetic-test-only");
    reserve.mockResolvedValue({ deliveryId: id, claimToken: token, payload }); begin.mockResolvedValue(payload); refresh.mockResolvedValue(payload);
    release.mockResolvedValue(true); record.mockResolvedValue(true); factory.mockReturnValue({ sendMail, close });
    unsubscribe.mockReturnValue("https://fixture.invalid/vsc-unsubscribe?token=synthetic");
    sendMail.mockResolvedValue({ messageId: payload.messageId, accepted: [payload.recipient], rejected: [], response: "250 accepted" });
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
  it("does nothing at all while the commercial gate is absent", async () => {
    vi.stubEnv("VSC_EMAIL_DISPATCH_ENABLED", ""); expect(await dispatchReservedVscEmail(tenant, id)).toEqual({ state: "disabled" });
    expect(reserve).not.toHaveBeenCalled(); expect(factory).not.toHaveBeenCalled();
  });
  it("releases preparation failures only before a provider start", async () => {
    vi.stubEnv("VSC_OVH_SMTP_PASSWORD", "");
    expect((await dispatchReservedVscEmail(tenant, id)).state).toBe("blocked"); expect(release).toHaveBeenCalledWith(tenant, id, token); expect(begin).not.toHaveBeenCalled(); expect(sendMail).not.toHaveBeenCalled();
  });
  it("refuses recipient lists and altered message identities", async () => {
    for (const recipient of ["shop@fixture.invalid,other", "\u0001shop@fixture.invalid"]) {
      reserve.mockResolvedValue({ deliveryId: id, claimToken: token, payload: { ...payload, recipient } });
      expect((await dispatchReservedVscEmail(tenant, id)).state).toBe("blocked");
    }
    expect(sendMail).not.toHaveBeenCalled();
  });
  it("does not release or send after an unconfirmed provider-start transition", async () => {
    begin.mockRejectedValue(new Error("DB response lost"));
    expect(await dispatchReservedVscEmail(tenant, id)).toEqual({ state: "review_required", reason: "begin_unconfirmed" });
    expect(sendMail).not.toHaveBeenCalled(); expect(release).not.toHaveBeenCalled(); expect(close).toHaveBeenCalledTimes(1);
  });
  it("stops a fresh eligibility or content change without calling SMTP", async () => {
    refresh.mockResolvedValue(null);
    expect((await dispatchReservedVscEmail(tenant, id)).state).toBe("blocked"); expect(sendMail).not.toHaveBeenCalled();
    expect(record).toHaveBeenCalledWith(tenant, id, token, "rejected", undefined);
  });
  it("enforces the promotion cutoff immediately before SMTP", async () => {
    refresh.mockImplementation(async () => { vi.setSystemTime(new Date("2026-11-30T23:00:00Z")); return payload; });
    expect((await dispatchReservedVscEmail(tenant, id)).state).toBe("blocked"); expect(sendMail).not.toHaveBeenCalled();
  });
  it("uses only reserved copy, fixed identity, one envelope recipient and the signed opt-out link", async () => {
    expect(await dispatchReservedVscEmail(tenant, id)).toEqual({ state: "sent" });
    expect(sendMail).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ messageId: payload.messageId, subject: payload.subject, from: { name: "VendreSonCommerce", address: "contact@vendresoncommerce.com" }, replyTo: "contact@vendresoncommerce.com", envelope: { from: "contact@vendresoncommerce.com", to: [payload.recipient] }, text: expect.stringContaining("vsc-unsubscribe?token=synthetic") }));
    expect(record).toHaveBeenCalledWith(tenant, id, token, "sent", payload.messageId);
  });
  it("keeps SMTP timeouts uncertain and never retries or releases the reservation", async () => {
    sendMail.mockRejectedValue({ code: "ETIMEDOUT", command: "DATA" });
    expect((await dispatchReservedVscEmail(tenant, id)).state).toBe("review_required"); expect(sendMail).toHaveBeenCalledTimes(1); expect(release).not.toHaveBeenCalled(); expect(record).toHaveBeenCalledWith(tenant, id, token, "unknown", undefined);
  });
  it("records a proven rejection without retrying it", async () => {
    sendMail.mockRejectedValue({ code: "EENVELOPE", command: "RCPT TO", responseCode: 550, response: "550 refused" });
    expect(await dispatchReservedVscEmail(tenant, id)).toEqual({ state: "rejected" }); expect(sendMail).toHaveBeenCalledTimes(1);
  });
  it("requires review when an accepted result cannot be persisted", async () => {
    record.mockRejectedValue(new Error("private DB error"));
    expect(await dispatchReservedVscEmail(tenant, id)).toEqual({ state: "review_required", reason: "result_unconfirmed" }); expect(sendMail).toHaveBeenCalledTimes(1); expect(release).not.toHaveBeenCalled();
  });
  it("does not turn a close failure into an invitation to resend", async () => {
    close.mockImplementation(() => { throw new Error("close error"); });
    expect(await dispatchReservedVscEmail(tenant, id)).toEqual({ state: "sent" }); expect(sendMail).toHaveBeenCalledTimes(1);
  });
});
