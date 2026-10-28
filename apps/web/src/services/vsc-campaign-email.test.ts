import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const { stop, unsubscribe } = vi.hoisted(() => ({ stop: vi.fn(), unsubscribe: vi.fn() }));
vi.mock("@/services/vsc-contact-stop", () => ({ checkVscContactStop: stop }));
vi.mock("@/services/vsc-unsubscribe-token", () => ({ createVscUnsubscribeUrl: unsubscribe }));
const sendMail = vi.fn();
const close = vi.fn();
vi.mock("@/services/ovh-connection", () => ({
  OVH_SENDER: "contact@vendresoncommerce.com",
  createOvhTransport: () => ({ sendMail, close })
}));
import { sendApprovedVscEmail } from "./vsc-campaign-email";
import type { VscPreflight } from "@/features/vsc-campaign/preflight";

const request: VscPreflight = {
  tenantId: "vsc", configuredTenantId: "vsc", sender: "contact@vendresoncommerce.com",
  channel: "email", scheduledDate: "2026-10-28",
  campaignApproved: true, campaignEnabled: true, providerConfigured: true,
  contact: { email: "shop@example.com", mobile: null, doNotContact: false,
    emailOptOut: false, smsOptOut: false, replied: false, appointmentBooked: false, purchased: false }
};

describe("VSC OVH transport", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-28T12:00:00Z")); sendMail.mockReset(); close.mockReset(); process.env.VSC_OVH_SMTP_PASSWORD = "test-only"; stop.mockReset(); stop.mockResolvedValue({ stopped: false }); unsubscribe.mockReset(); unsubscribe.mockReturnValue("https://example.com/vsc-unsubscribe?token=test"); });
  afterEach(() => vi.useRealTimers());
  it("blocks delayed promotional messages from midnight in Paris on December 1", async () => {
    vi.setSystemTime(new Date("2026-11-30T23:00:00Z"));
    expect(await sendApprovedVscEmail(request, { personId: "person", recipient: "shop@example.com", subject: "Test", text: "Message" })).toEqual({ success: false, error: "offer_expired" });
    expect(stop).not.toHaveBeenCalled(); expect(sendMail).not.toHaveBeenCalled();
  });
  it("allows the last second of November 30 in Paris", async () => {
    vi.setSystemTime(new Date("2026-11-30T22:59:59Z")); sendMail.mockResolvedValue({ messageId: "test-id" });
    expect((await sendApprovedVscEmail(request, { personId: "person", recipient: "shop@example.com", subject: "Test", text: "Message" })).success).toBe(true);
  });
  it("rechecks expiry after a slow database lookup crosses midnight", async () => {
    vi.setSystemTime(new Date("2026-11-30T22:59:59Z"));
    stop.mockImplementation(async () => { vi.setSystemTime(new Date("2026-11-30T23:00:00Z")); return { stopped: false }; });
    expect(await sendApprovedVscEmail(request, { personId: "person", recipient: "shop@example.com", subject: "Test", text: "Message" })).toEqual({ success: false, error: "offer_expired" });
    expect(sendMail).not.toHaveBeenCalled();
  });
  it("blocks a stopped contact without invoking SMTP", async () => {
    const result = await sendApprovedVscEmail(
      { ...request, contact: { ...request.contact, replied: true } },
      { personId: "person", recipient: "shop@example.com", subject: "Test", text: "Message" }
    );
    expect(result.success).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });
  it("blocks wrong recipients without invoking SMTP", async () => {
    const result = await sendApprovedVscEmail(request,
      { personId: "person", recipient: "other@example.com", subject: "Test", text: "Message" });
    expect(result.success).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });
  it("blocks a persisted opt-out even if caller flags say otherwise", async () => {
    stop.mockResolvedValue({ stopped: true });
    expect((await sendApprovedVscEmail(request, { personId: "person", recipient: "shop@example.com", subject: "Test", text: "Message" })).success).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });
  it("blocks sending when the stop check or link signing is unavailable", async () => {
    stop.mockRejectedValue(new Error("DB offline"));
    expect((await sendApprovedVscEmail(request, { personId: "person", recipient: "shop@example.com", subject: "Test", text: "Message" })).success).toBe(false);
    stop.mockResolvedValue({ stopped: false }); unsubscribe.mockImplementation(() => { throw new Error("Missing key"); });
    expect((await sendApprovedVscEmail(request, { personId: "person", recipient: "shop@example.com", subject: "Test", text: "Message" })).success).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });
  it("keeps the unsubscribe footer inside a complete HTML document", async () => {
    sendMail.mockResolvedValue({ messageId: "test-id" });
    await sendApprovedVscEmail(request, { personId: "person", recipient: "shop@example.com", subject: "Test", text: "Message", html: "<html><body>Message</body></html>" });
    expect(sendMail.mock.calls[0][0].html).toMatch(/se désinscrire<\/a><\/p><\/body><\/html>$/);
  });
  it("uses only the VSC identity when authorized", async () => {
    sendMail.mockResolvedValue({ messageId: "test-id" });
    const result = await sendApprovedVscEmail(request,
      { personId: "person", recipient: "shop@example.com", subject: "Test", text: "Message" });
    expect(result).toEqual({ success: true, messageId: "test-id" });
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: { name: "VendreSonCommerce", address: "contact@vendresoncommerce.com" },
      replyTo: "contact@vendresoncommerce.com",
      text: expect.stringContaining("https://example.com/vsc-unsubscribe?token=test")
    }));
    expect(close).toHaveBeenCalled();
  });
});
