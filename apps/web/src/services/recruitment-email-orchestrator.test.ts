vi.mock("@/services/local-calendar-stops", () => ({ syncLocalCalendarStops: (...args: unknown[]) => mocks.calendar(...args) ?? Promise.resolve({ stopped: 0, verified: true }) }));
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runRecruitmentEmailOrchestration } from "./recruitment-email-orchestrator";

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), send: vi.fn(), initial: vi.fn(), calendar: vi.fn() }));
vi.mock("@/lib/supabase/service-role", () => ({
  createSupabaseServiceRoleClient: () => ({ from: mocks.from, rpc: mocks.rpc })
}));
vi.mock("@/services/brevo", () => ({ sendRecruitmentFollowUpEmail: mocks.send, sendInitialRecruitmentEmail: mocks.initial }));

const activeSequence = { id: "sequence", email: "candidate@example.test", status: "sent", lifecycle_status: "running" };
const person = { id: "person", display_name: "Candidate", contact_allowed: true, do_not_contact: false, comments: null as string | null };
const step = { id: "step", sequence_id: "sequence", person_id: "person", step_index: 1 };

function setup(sequence: typeof activeSequence | null = activeSequence, contact = person, lookupError: Error | null = null) {
  mocks.from.mockImplementation((table: string) => {
    const query = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(), not: vi.fn().mockReturnThis(), neq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
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

  it("never sends a previously queued national follow-up for a Lyon draft", async () => {
    setup(activeSequence, { ...person, comments: "[projet-lyon-neos-20261007]" });
    expect(await runRecruitmentEmailOrchestration()).toMatchObject({ sent: 0, errors: 1 });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("complete_recruitment_email_step", expect.objectContaining({
      p_success: false, p_provider_message_id: null, p_error: expect.stringContaining("Campagne Lyon en brouillon")
    }));
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

describe("Lyon pinned delays and models", () => {
  const projectId = "11111111-1111-4111-8111-111111111111";
  const personId = "22222222-2222-4222-8222-222222222222";
  const versionIds = [3,4,5].map(i => `${String(i).repeat(8)}-${String(i).repeat(4)}-4${String(i).repeat(3)}-8${String(i).repeat(3)}-${String(i).repeat(12)}`);
  const campaign = { state: "ready", launch_enabled: true, sender_verified: true, version_ids: versionIds, recipient_ids: [personId], template_ids: [71,72,73] };
  const snapshot = { key: "lyon-development", project_id: projectId, version_ids: versionIds, template_ids: [71,72,73], days: [0,17,32] };
  it.each([[1,"2026-10-18T10:00:00.000Z",72],[2,"2026-11-02T10:00:00.000Z",73]])("schedules step %s from J0 and selects its Lyon template", async (index, dueAt, templateId) => {
    vi.resetAllMocks();
    const queued: Record<string, unknown>[] = [];
    const sequence = { ...activeSequence, tenant_id: "tenant", person_id: personId, sent_at: "2026-10-01T10:00:00.000Z", campaign_snapshot: snapshot };
    mocks.from.mockImplementation((table: string) => {
      const row = table === "people" ? { ...person, id: personId, comments: "[projet-lyon-neos-20261007]" } : table === "projects" ? { metadata: { recruitment_email_campaign: campaign } } : sequence;
      const data = table === "recruitment_email_sequence_steps" ? index === 1 ? [] : [{ step_index: 1, status: "sent" }] : row;
      const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(), not: vi.fn().mockReturnThis(), neq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(),
        insert: vi.fn((value: Record<string, unknown>) => { queued.push(value); return query; }), update: vi.fn().mockReturnThis(), upsert: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => ({ data: row, error: null })), limit: vi.fn(async () => ({ data: [sequence], error: null })), then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve) };
      return query;
    });
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "claim_due_recruitment_email_steps" ? [{ ...step, tenant_id: "tenant", person_id: personId, step_index: index }] : null, error: null }));
    mocks.send.mockResolvedValue({ success: true, messageId: "lyon" });
    expect(await runRecruitmentEmailOrchestration()).toMatchObject({ scheduled: 1, sent: 1 });
    expect(queued[0]).toMatchObject({ step_index: index, scheduled_at: dueAt });
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ templateId }));
  });
});

describe("Saint-Maur scheduled initial and pinned follow-ups", () => {
  const projectId = "11111111-1111-4111-8111-111111111111";
  const personId = "22222222-2222-4222-8222-222222222222";
  const snapshot = { key: "saint-maur-local-20261016", project_id: projectId, content_hash: "a".repeat(64), template_ids: [82,83,84], first_name: "Marie Claire", city: "Créteil", days: [0,10,20] };
  const campaign = { state: "ready", launch_enabled: true, sender_verified: true, recipient_ids: [personId], template_ids: [81,82,83,84], content_hash: snapshot.content_hash };
  function localSetup(index: number, overrides: Record<string, unknown> = {}, stopped = false) {
    const sequence = { ...activeSequence, status: index === 0 ? "pending" : "sent", lifecycle_status: stopped ? "stopped" : "running", tenant_id: "tenant", person_id: personId, sent_at: index === 0 ? null : "2026-10-17T07:30:00Z", campaign_snapshot: snapshot };
    const queued: Record<string, unknown>[] = [];
    mocks.from.mockImplementation((table: string) => {
      const row = table === "people" ? { ...person, id: personId } : table === "projects" ? { status: "open", archived_at: null, metadata: { local_recruitment_campaign: { ...campaign, ...overrides }, recruitment_email_campaign: { launch_enabled: true } } } : sequence;
      const data = table === "recruitment_email_sequence_steps" ? index === 2 ? [{ step_index: 1, status: "sent" }] : [] : row;
      const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(), not: vi.fn().mockReturnThis(), neq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(),
        insert: vi.fn((value: Record<string, unknown>) => { queued.push(value); return query; }), update: vi.fn().mockReturnThis(), upsert: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => ({ data: row, error: null })), limit: vi.fn(async () => ({ data: index === 0 ? [] : [sequence], error: null })), then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve) };
      return query;
    });
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "claim_due_recruitment_email_steps" ? [{ ...step, tenant_id: "tenant", person_id: personId, step_index: index }] : null, error: null }));
    mocks.send.mockResolvedValue({ success: true, messageId: "local" });
    return queued;
  }
  it.each([[1,"2026-10-27T08:30:00.000Z",83],[2,"2026-11-06T08:30:00.000Z",84]])("schedules Paris J+10/J+20 and uses only the pinned local model", async (index,dueAt,templateId) => {
    vi.resetAllMocks(); const queued=localSetup(index);
    expect(await runRecruitmentEmailOrchestration()).toMatchObject({ scheduled: 1, sent: 1 });
    expect(queued[0]).toMatchObject({ step_index: index, scheduled_at: dueAt });
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ templateId, params: { PRENOM: "Marie Claire", VILLE: "Créteil" } }));
  });
  it.each([{ launch_enabled: false },{ content_hash: "b".repeat(64) },{ template_ids: [81,82,99,84] },{ recipient_ids: [] }])("blocks a suspended or changed campaign", async overrides => {
    vi.resetAllMocks(); localSetup(1,overrides);
    expect(await runRecruitmentEmailOrchestration()).toMatchObject({ scheduled: 0, sent: 0, errors: 1 });
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("sends the nearby variant and atomically records the initial provider result", async () => {
    vi.resetAllMocks(); localSetup(0); mocks.initial.mockResolvedValue({ success: true, messageId: "initial" });
    expect(await runRecruitmentEmailOrchestration()).toMatchObject({ sent: 1, errors: 0 });
    expect(mocks.initial).toHaveBeenCalledWith(expect.objectContaining({ templateId: 82, params: { PRENOM: "Marie Claire", VILLE: "Créteil" } }));
    expect(mocks.rpc).toHaveBeenCalledWith("complete_local_recruitment_initial", { p_step_id: "step", p_success: true, p_provider_message_id: "initial", p_error: null });
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("blocks local sends when the calendar guard is unavailable", async () => {
    vi.resetAllMocks(); localSetup(0); mocks.calendar.mockResolvedValue({ stopped: 0, verified: false });
    expect(await runRecruitmentEmailOrchestration()).toMatchObject({ sent: 0, errors: 1 });
    expect(mocks.initial).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("does not send an initial step stopped after a reply", async () => {
    vi.resetAllMocks(); localSetup(0,{},true);
    expect(await runRecruitmentEmailOrchestration()).toMatchObject({ sent: 0, skipped: 1 });
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
