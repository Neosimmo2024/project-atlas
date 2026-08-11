import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Person, RecruitmentEmailSequence, TenantContext } from "@/types/domain";

const mocks = vi.hoisted(() => ({ context: vi.fn(), person: vi.fn(), get: vi.fn(), claim: vi.fn(), complete: vi.fn(), stop: vi.fn(), send: vi.fn() }));
vi.mock("@/repositories/tenant-context", () => ({ getTenantContext: mocks.context }));
vi.mock("@/repositories/people", () => ({ getPersonDetail: mocks.person }));
vi.mock("@/repositories/recruitment-email-sequences", () => ({
  getRecruitmentEmailSequence: mocks.get,
  claimRecruitmentEmailSequence: mocks.claim,
  completeRecruitmentEmailSequence: mocks.complete,
  stopRecruitmentEmailSequence: mocks.stop
}));
vi.mock("@/services/brevo", () => ({ sendInitialRecruitmentEmail: mocks.send }));

const context: TenantContext = { tenantId: "tenant-a", tenant: { id: "tenant-a", name: "A" }, userId: "user-a", role: "recruiter" };
const person = { id: "person-a", tenant_id: "tenant-a", display_name: "Alice Martin", primary_email: "alice@example.fr", contact_allowed: true, do_not_contact: false } as Person;
const sequence = { id: "sequence-a", tenant_id: "tenant-a", person_id: person.id, email: person.primary_email, status: "pending" } as RecruitmentEmailSequence;
const route = { params: Promise.resolve({ id: person.id }) };

describe("recruitment email API", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.context.mockResolvedValue(context);
    mocks.person.mockResolvedValue({ person, organizations: [], relationships: [] });
    mocks.claim.mockResolvedValue(sequence);
  });

  it("sends once and stores the Brevo message id", async () => {
    const { POST } = await import("../../app/api/people/[id]/recruitment-email/route");
    mocks.send.mockResolvedValue({ success: true, messageId: "brevo-1" });
    mocks.complete.mockResolvedValue({ ...sequence, status: "sent", provider_message_id: "brevo-1" });
    const response = await POST(new Request("http://localhost", { method: "POST" }), route);
    expect(response.status).toBe(200);
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ sequenceId: "sequence-a", email: "alice@example.fr" }));
    expect(mocks.complete).toHaveBeenCalledWith(context, "sequence-a", { success: true, providerMessageId: "brevo-1" });
  });

  it("does not call Brevo again when the sequence is already sent", async () => {
    const { POST } = await import("../../app/api/people/[id]/recruitment-email/route");
    mocks.claim.mockResolvedValue({ ...sequence, status: "sent" });
    const response = await POST(new Request("http://localhost", { method: "POST" }), route);
    expect(response.status).toBe(200);
    expect((await response.json()).duplicatePrevented).toBe(true);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("stores an error without a false sent status", async () => {
    const { POST } = await import("../../app/api/people/[id]/recruitment-email/route");
    mocks.send.mockResolvedValue({ success: false, error: "Brevo refused" });
    mocks.complete.mockResolvedValue({ ...sequence, status: "error", last_error: "Brevo refused" });
    const response = await POST(new Request("http://localhost", { method: "POST" }), route);
    expect(response.status).toBe(502);
    expect(mocks.complete).toHaveBeenCalledWith(context, "sequence-a", { success: false, error: "Brevo refused" });
  });

  it("blocks people without email and readers before sending", async () => {
    const { POST } = await import("../../app/api/people/[id]/recruitment-email/route");
    mocks.person.mockResolvedValue({ person: { ...person, primary_email: null }, organizations: [], relationships: [] });
    expect((await POST(new Request("http://localhost", { method: "POST" }), route)).status).toBe(400);
    mocks.context.mockResolvedValue({ ...context, role: "reader" });
    expect((await POST(new Request("http://localhost", { method: "POST" }), route)).status).toBe(403);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("stops the existing sequence manually", async () => {
    const { DELETE } = await import("../../app/api/people/[id]/recruitment-email/route");
    mocks.get.mockResolvedValue(sequence);
    mocks.stop.mockResolvedValue({ ...sequence, status: "stopped" });
    const response = await DELETE(new Request("http://localhost", { method: "DELETE" }), route);
    expect(response.status).toBe(200);
    expect(mocks.stop).toHaveBeenCalledWith(context, "sequence-a");
  });
});
