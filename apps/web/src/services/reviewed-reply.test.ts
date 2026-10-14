import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), fetch: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service-role", () => ({ createSupabaseServiceRoleClient: () => ({ from: mocks.from }) }));
import { reviewReply } from "./reviewed-reply";
import type { TenantContext } from "@/types/domain";
const ctx = { role: "owner", tenantId: "tenant", userId: "owner" } as TenantContext;
const task = { id: "task", person_id: "person", metadata: { source: "recruitment_candidate_reply", sequence_id: "sequence", reply_status: "draft", reply_revision: 0, subject: "Re: Lyon" } };
function query(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is", "contains", "update"]) q[method] = vi.fn(() => q);
  q.maybeSingle = vi.fn(async () => result);
  q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return q;
}
function responses(...results: unknown[]) { for (const result of results) mocks.from.mockReturnValueOnce(query(result)); }
beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal("fetch", mocks.fetch); vi.stubEnv("BREVO_API_KEY", "fixture"); });
describe("manual reply approval", () => {
  it("journals an accepted message and completes the task without restarting the sequence", async () => {
    responses({ data: task }, { data: { email: "verified@example.org", lifecycle_status: "stopped" } },
      { data: { contact_allowed: true, do_not_contact: false } }, { data: { id: "task" } }, { error: null });
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ messageId: "<accepted@brevo>" }), { status: 201 }));
    expect(await reviewReply(ctx, "task", { action: "send", body: "Message relu", revision: 0, confirmation: "approve_exact_reply" })).toEqual({ status: "sent", revision: 1 });
    expect(mocks.from.mock.calls.filter(([table]) => table === "recruitment_email_sequences")).toHaveLength(1);
    const finalQuery = mocks.from.mock.results.at(-1)!.value;
    expect(finalQuery.update).toHaveBeenCalledWith(expect.objectContaining({ status: "completed", metadata: expect.objectContaining({ reply_status: "sent", reply_provider_message_id: "<accepted@brevo>" }) }));
  });
  it("rejects unapproved and stale replies without calling Brevo", async () => {
    responses({ data: task });
    await expect(reviewReply(ctx, "task", { action: "send", body: "Bonjour", revision: 0 })).rejects.toThrow("REPLY_NOT_APPROVED");
    expect(mocks.fetch).not.toHaveBeenCalled();
    responses({ data: task });
    await expect(reviewReply(ctx, "task", { action: "save", body: "Bonjour", revision: 1 })).rejects.toThrow("REPLY_LOCKED");
  });
  it("does not send when another request wins the durable claim", async () => {
    responses({ data: task }, { data: { email: "verified@example.org", lifecycle_status: "stopped" } },
      { data: { contact_allowed: true, do_not_contact: false } }, { data: null });
    await expect(reviewReply(ctx, "task", { action: "send", body: "Bonjour", revision: 0, confirmation: "approve_exact_reply" })).rejects.toThrow("REPLY_LOCKED");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("locks an ambiguous provider outcome and never retries the POST", async () => {
    responses({ data: task }, { data: { email: "verified@example.org", lifecycle_status: "stopped" } },
      { data: { contact_allowed: true, do_not_contact: false } }, { data: { id: "task" } }, { error: null });
    mocks.fetch.mockRejectedValue(new Error("timeout"));
    expect(await reviewReply(ctx, "task", { action: "send", body: "Bonjour", revision: 0, confirmation: "approve_exact_reply" })).toEqual({ status: "unknown", revision: 1 });
    expect(mocks.fetch).toHaveBeenCalledOnce();
    const payload = JSON.parse(mocks.fetch.mock.calls[0][1].body);
    expect(payload.to).toEqual([{ email: "verified@example.org" }]);
    expect(payload.sender.email).toBe("renato.ponzio@neos-immo.com");
  });
  it("blocks restricted contacts even with approval", async () => {
    responses({ data: task }, { data: { email: "verified@example.org", lifecycle_status: "stopped" } },
      { data: { contact_allowed: true, do_not_contact: true } });
    await expect(reviewReply(ctx, "task", { action: "send", body: "Bonjour", revision: 0, confirmation: "approve_exact_reply" })).rejects.toThrow("REPLY_CONTACT_BLOCKED");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
