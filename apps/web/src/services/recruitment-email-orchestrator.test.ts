import { beforeEach, describe, expect, it, vi } from "vitest";
import { runRecruitmentEmailOrchestration } from "./recruitment-email-orchestrator";

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/supabase/service-role", () => ({
  createSupabaseServiceRoleClient: () => ({ from: mocks.from, rpc: mocks.rpc })
}));
vi.mock("@/services/brevo", () => ({ sendRecruitmentFollowUpEmail: mocks.send }));

const activeSequence = { id: "sequence", email: "candidate@example.test", status: "sent", lifecycle_status: "running" };
const person = { id: "person", display_name: "Candidate", contact_allowed: true, do_not_contact: false };
const step = { id: "step", sequence_id: "sequence", person_id: "person", step_index: 1 };

function setup(sequence: typeof activeSequence | null = activeSequence, contact = person, lookupError: Error | null = null) {
  mocks.from.mockImplementation((table: string) => {
    const query = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(), neq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
      // Nothing new to schedule; the worker already claimed a due step.
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      maybeSingle: vi.fn().mockResolvedValue({
        data: table === "people" ? contact : sequence,
        error: table === "people" ? null : lookupError
      })
    };
    return query;
  });
  mocks.rpc.mockImplementation(async (name: string) => ({
    data: name === "claim_due_recruitment_email_steps" ? [step] : null, error: null
  }));
  mocks.send.mockResolvedValue({ success: true, messageId: "message" });
}

describe("recruitment follow-up checks after claim", () => {
  beforeEach(() => { vi.resetAllMocks(); setup(); });

  it("sends an active, authorized follow-up and records its result", async () => {
    expect(await runRecruitmentEmailOrchestration()).toMatchObject({ claimed: 1, sent: 1, errors: 0 });
    expect(mocks.send).toHaveBeenCalledExactlyOnceWith({
      stepId: "step", stepIndex: 1, email: "candidate@example.test", displayName: "Candidate"
    });
    expect(mocks.rpc).toHaveBeenCalledWith("complete_recruitment_email_step", {
      p_step_id: "step", p_success: true, p_provider_message_id: "message", p_error: null
    });
  });

  it.each<[string, typeof activeSequence | null]>([
    ["status stopped after reply/refusal", { ...activeSequence, status: "stopped" }],
    ["lifecycle stopped", { ...activeSequence, lifecycle_status: "stopped" }],
    ["lifecycle completed", { ...activeSequence, lifecycle_status: "completed" }],
    ["initial email not sent", { ...activeSequence, status: "pending" }],
    ["sequence deleted", null]
  ])("does not send or complete a stale claim: %s", async (_label, sequence) => {
    setup(sequence);
    expect(await runRecruitmentEmailOrchestration()).toMatchObject({ claimed: 1, sent: 0, errors: 0, skipped: 1 });
    expect(mocks.send).not.toHaveBeenCalled();
    // Stop/delete handlers already cancel/remove the step; completion would fail or overwrite state.
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual(["claim_due_recruitment_email_steps"]);
  });

  it.each([
    { ...person, contact_allowed: false },
    { ...person, do_not_contact: true }
  ])("does not send when contact permission changes after claim", async (contact) => {
    setup(activeSequence, contact);
    expect(await runRecruitmentEmailOrchestration()).toMatchObject({ sent: 0, errors: 1 });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("fails closed when the sequence lookup fails", async () => {
    const error = new Error("lookup failed");
    setup(activeSequence, person, error);
    await expect(runRecruitmentEmailOrchestration()).rejects.toThrow("lookup failed");
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
