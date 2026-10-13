import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ context: vi.fn(), person: vi.fn(), followup: vi.fn(), types: vi.fn(), create: vi.fn() }));
vi.mock("@/repositories/tenant-context", () => ({ getTenantContext: mocks.context }));
vi.mock("@/repositories/people", () => ({ getPersonDetail: mocks.person }));
vi.mock("@/repositories/whatsapp-followup", () => ({ getWhatsAppFollowup: mocks.followup }));
vi.mock("@/repositories/interactions", () => ({ listInteractionTypes: mocks.types, createInteraction: mocks.create }));
import { POST } from "@/app/api/people/[id]/whatsapp/route";
const id = "120223f0-4344-49d2-8f52-b3a31c6ee2cb";
const call = (event = "sent", summary = "Message vérifié") => POST(new Request("http://localhost/api", { method: "POST", body: JSON.stringify({ event, summary }) }), { params: Promise.resolve({ id }) });
beforeEach(() => {
  vi.clearAllMocks(); mocks.context.mockResolvedValue({ role: "owner", tenantId: id, userId: id });
  mocks.person.mockResolvedValue({ person: { contact_allowed: true, do_not_contact: false } });
  mocks.followup.mockResolvedValue({ consent: true }); mocks.types.mockResolvedValue([{ slug: "whatsapp", id }]); mocks.create.mockResolvedValue({ id });
});
it("rejects unauthenticated and read-only writes", async () => {
  mocks.context.mockResolvedValueOnce(null); expect((await call()).status).toBe(401);
  mocks.context.mockResolvedValueOnce({ role: "reader" }); expect((await call()).status).toBe(403);
  expect(mocks.create).not.toHaveBeenCalled();
});
it("rejects a contact outside the tenant", async () => { mocks.person.mockResolvedValue(null); expect((await call()).status).toBe(404); expect(mocks.create).not.toHaveBeenCalled(); });
it("blocks sent confirmation without consent or with no-contact", async () => {
  mocks.followup.mockResolvedValue({ consent: false }); expect((await call()).status).toBe(409);
  mocks.person.mockResolvedValue({ person: { contact_allowed: true, do_not_contact: true } }); expect((await call()).status).toBe(409);
  expect(mocks.create).not.toHaveBeenCalled();
});
it("requires evidence for consent", async () => { expect((await call("consent_granted", " ")).status).toBe(400); expect(mocks.create).not.toHaveBeenCalled(); });
it("records only a manual event with its person and audit metadata", async () => {
  expect((await call()).status).toBe(201);
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ tenantId: id }), expect.objectContaining({ person_id: id, type_id: id, summary: "Message vérifié", metadata: { channel: "whatsapp_manual", whatsapp_event: "sent" } }));
});
it("permits recording a withdrawal even when contact is blocked", async () => {
  mocks.person.mockResolvedValue({ person: { contact_allowed: false, do_not_contact: true } });
  expect((await call("consent_revoked")).status).toBe(201);
});
