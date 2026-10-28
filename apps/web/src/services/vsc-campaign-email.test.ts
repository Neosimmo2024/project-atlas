import { describe, expect, it, vi, beforeEach } from "vitest";

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
  beforeEach(() => { sendMail.mockReset(); close.mockReset(); process.env.VSC_OVH_SMTP_PASSWORD = "test-only"; });
  it("blocks a stopped contact without invoking SMTP", async () => {
    const result = await sendApprovedVscEmail(
      { ...request, contact: { ...request.contact, replied: true } },
      { recipient: "shop@example.com", subject: "Test", text: "Message" }
    );
    expect(result.success).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });
  it("blocks wrong recipients without invoking SMTP", async () => {
    const result = await sendApprovedVscEmail(request,
      { recipient: "other@example.com", subject: "Test", text: "Message" });
    expect(result.success).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });
  it("uses only the VSC identity when authorized", async () => {
    sendMail.mockResolvedValue({ messageId: "test-id" });
    const result = await sendApprovedVscEmail(request,
      { recipient: "shop@example.com", subject: "Test", text: "Message" });
    expect(result).toEqual({ success: true, messageId: "test-id" });
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: { name: "VendreSonCommerce", address: "contact@vendresoncommerce.com" },
      replyTo: "contact@vendresoncommerce.com"
    }));
    expect(close).toHaveBeenCalled();
  });
});
