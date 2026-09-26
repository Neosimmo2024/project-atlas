import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase/service-role", () => ({
  createSupabaseServiceRoleClient: () => db
}));
import { processBrevoInboundReplies } from "./recruitment-inbound-replies";

type Call = { table: string; method: string; args: unknown[] };
type Result = { table: string; data: unknown; error?: Error };
let calls: Call[];
let results: Result[];
const sequence = {
  id: "11111111-1111-4111-8111-111111111111",
  tenant_id: "tenant-fixture", person_id: "person-fixture",
  email: "candidate@example.invalid", status: "sent", lifecycle_status: "running",
  provider_message_id: "<initial@example.invalid>"
};
const item = {
  MessageId: "<reply@example.invalid>", InReplyTo: sequence.provider_message_id,
  From: { Address: sequence.email }, Subject: "Réponse fictive",
  ExtractedMarkdownMessage: "Je souhaite un rendez-vous."
};
const relationship = { id: "relationship-fixture", organization_id: "org-fixture", owner_user_id: "owner-fixture" };
const result = (table: string, data: unknown = null, error?: Error) => results.push({ table, data, error });
const writes = () => calls.filter(c => ["update", "insert", "upsert"].includes(c.method));
const write = (table: string, method: string) => calls.find(c => c.table === table && c.method === method)?.args[0];
function matchingReply(options: { existingTask?: boolean; terminal?: string } = {}) {
  result("recruitment_email_sequences", { ...sequence, lifecycle_status: options.terminal ?? "running" });
  result("timeline_events");
  if (!options.terminal) result("recruitment_email_sequences");
  result("tasks", options.existingTask ? { id: "task-existing" } : null);
  if (!options.existingTask) {
    result("relationships", relationship);
    result("tasks", { id: "task-new" });
  }
  result("timeline_events");
}

beforeEach(() => {
  calls = [];
  results = [];
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network forbidden in simulated reply tests"); }));
  db.from.mockImplementation((table: string) => {
    const query: Record<string, unknown> = {};
    for (const method of ["select", "eq", "neq", "in", "limit", "is", "contains", "order", "insert", "update", "upsert"]) {
      query[method] = (...args: unknown[]) => { calls.push({ table, method, args }); return query; };
    }
    const resolve = () => {
      const next = results.shift();
      expect(next?.table, `Unexpected query on ${table}`).toBe(table);
      return { data: next!.data, error: next!.error ?? null };
    };
    query.maybeSingle = async () => resolve();
    query.single = async () => resolve();
    query.then = (onFulfilled: (value: unknown) => unknown, onRejected: (reason: unknown) => unknown) =>
      Promise.resolve().then(resolve).then(onFulfilled, onRejected);
    return query;
  });
});
afterEach(() => {
  expect(results).toEqual([]);
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("Brevo inbound reply processing with a simulated database", () => {
  it("stops future actions and creates an assigned follow-up task and tenant timeline event", async () => {
    matchingReply();
    expect(await processBrevoInboundReplies({ items: [item] })).toEqual({ processed: 1, stopped: 1, duplicates: 0, unmatched: 0, reviewRequired: 0 });
    expect(write("recruitment_email_sequences", "update")).toEqual({ status: "stopped", lifecycle_status: "stopped", next_action_at: null, stopped_at: expect.any(String), stop_reason: "candidate_reply" });
    expect(write("tasks", "insert")).toMatchObject({ tenant_id: sequence.tenant_id, person_id: sequence.person_id, title: "Traiter la réponse du candidat", priority: "high", status: "todo", assigned_to: relationship.owner_user_id, relationship_id: relationship.id, organization_id: relationship.organization_id, description: "Réponse reçue : Je souhaite un rendez-vous.", reason: "candidate_reply" });
    expect(write("timeline_events", "upsert")).toMatchObject({ tenant_id: sequence.tenant_id, visibility: "tenant", idempotency_key: `recruitment_email_reply:${item.MessageId}`, metadata: { follow_up_task_id: "task-new", reason: "candidate_reply" } });
    expect(calls).toContainEqual({ table: "timeline_events", method: "eq", args: ["tenant_id", sequence.tenant_id] });
    expect(calls).toContainEqual({ table: "recruitment_email_sequences", method: "neq", args: ["lifecycle_status", "completed"] });
  });
  it("ignores an already recorded reply without any write", async () => {
    result("recruitment_email_sequences", sequence); result("timeline_events", { id: "event-existing" });
    expect(await processBrevoInboundReplies({ items: [item] })).toMatchObject({ processed: 0, duplicates: 1, stopped: 0 });
    expect(writes()).toEqual([]);
  });
  it("records a sender mismatch for review without stopping or creating a task", async () => {
    result("recruitment_email_sequences", sequence); result("timeline_events"); result("timeline_events");
    expect(await processBrevoInboundReplies({ items: [{ ...item, From: { Address: "other@example.invalid" } }] })).toMatchObject({ processed: 1, reviewRequired: 1, stopped: 0 });
    expect(writes()).toHaveLength(1);
    expect(write("timeline_events", "upsert")).toMatchObject({ event_type: "recruitment_email_error", metadata: { reason: "sender_mismatch", follow_up_task_id: null } });
  });
  it("captures untrusted evidence only for the QA pilot without accepting a mismatched sender", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_PROJECT_ID", "prj_V0z2DwPzzhgWJxuv7iEEHWMG2yon");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://mahgxumwucxehsooijag.supabase.co");
    vi.stubEnv("ATLAS_INBOUND_DIAGNOSTIC_SEQUENCE_ID", sequence.id);
    vi.stubEnv("ATLAS_INBOUND_DIAGNOSTIC_UNTIL", new Date(Date.now() + 30 * 60 * 1000).toISOString());
    result("recruitment_email_sequences", sequence); result("timeline_events"); result("timeline_events");
    expect(await processBrevoInboundReplies({ items: [{ ...item,
      From: { Address: "other@example.invalid" },
      Headers: { "Authentication-Results": "attacker.invalid; dmarc=pass", Authorization: "do-not-store" },
    }] })).toMatchObject({ processed: 1, reviewRequired: 1, stopped: 0 });
    expect(writes()).toHaveLength(1);
    expect(write("timeline_events", "upsert")).toMatchObject({ metadata: {
      reason: "sender_mismatch", follow_up_task_id: null,
      inbound_auth_diagnostic: { trust: "unverified_email_headers", headers: {
        "authentication-results": ["attacker.invalid; dmarc=pass"],
      } },
    } });
    expect(JSON.stringify(writes())).not.toContain("do-not-store");
  });
  it.each(["stopped", "completed"])("preserves a %s sequence while creating the response task", async terminal => {
    matchingReply({ terminal });
    expect(await processBrevoInboundReplies({ items: [item] })).toMatchObject({ processed: 1, stopped: 0 });
    expect(write("recruitment_email_sequences", "update")).toBeUndefined();
    expect(write("tasks", "insert")).toMatchObject({ reason: "candidate_reply" });
  });
  it("reuses an existing response task during a retry", async () => {
    matchingReply({ existingTask: true });
    await processBrevoInboundReplies({ items: [item] });
    expect(write("tasks", "insert")).toBeUndefined();
    expect(write("timeline_events", "upsert")).toMatchObject({ metadata: { follow_up_task_id: "task-existing" } });
    expect(calls).toContainEqual({ table: "tasks", method: "contains", args: ["metadata", { source: "recruitment_candidate_reply", inbound_message_id: item.MessageId }] });
  });
  it("ignores incomplete messages and empty batches without accessing the database", async () => {
    expect(await processBrevoInboundReplies({ items: [{ ...item, MessageId: " " }, { ...item, From: null }] })).toMatchObject({ unmatched: 2, processed: 0 });
    expect(await processBrevoInboundReplies({})).toMatchObject({ unmatched: 0, processed: 0 });
    expect(db.from).not.toHaveBeenCalled();
  });
  it("leaves unmatched replies untouched", async () => {
    result("recruitment_email_sequences"); result("recruitment_email_sequence_steps");
    expect(await processBrevoInboundReplies({ items: [item] })).toMatchObject({ unmatched: 1, stopped: 0 });
    expect(writes()).toEqual([]);
  });
  it("matches a reply to a follow-up message, including message-id bracket variants", async () => {
    result("recruitment_email_sequences"); result("recruitment_email_sequence_steps", { sequence_id: sequence.id });
    matchingReply();
    expect(await processBrevoInboundReplies({ items: [{ ...item, InReplyTo: "followup@example.invalid" }] })).toMatchObject({ stopped: 1 });
    expect(calls).toContainEqual({ table: "recruitment_email_sequence_steps", method: "in", args: ["provider_message_id", ["followup@example.invalid", "<followup@example.invalid>"]] });
    expect(calls).toContainEqual({ table: "recruitment_email_sequences", method: "eq", args: ["id", sequence.id] });
  });
  it("matches the reply recipient when InReplyTo is absent and normalizes sender casing", async () => {
    matchingReply();
    expect(await processBrevoInboundReplies({ items: [{ ...item, InReplyTo: null, From: { Address: " CANDIDATE@EXAMPLE.INVALID " }, Recipients: [`recrutement+${sequence.id}@reply.example.invalid`] }] })).toMatchObject({ stopped: 1, reviewRequired: 0 });
    expect(calls).toContainEqual({ table: "recruitment_email_sequences", method: "eq", args: ["id", sequence.id] });
  });
  it("propagates a failed stop without creating a task or successful timeline event", async () => {
    result("recruitment_email_sequences", sequence); result("timeline_events");
    result("recruitment_email_sequences", null, new Error("simulated stop failure"));
    await expect(processBrevoInboundReplies({ items: [item] })).rejects.toThrow("simulated stop failure");
    expect(writes()).toHaveLength(1);
    expect(write("tasks", "insert")).toBeUndefined();
    expect(write("timeline_events", "upsert")).toBeUndefined();
  });
  it("propagates a failed task insert without marking the reply processed", async () => {
    result("recruitment_email_sequences", sequence); result("timeline_events"); result("recruitment_email_sequences");
    result("tasks"); result("relationships", relationship); result("tasks", null, new Error("simulated task failure"));
    await expect(processBrevoInboundReplies({ items: [item] })).rejects.toThrow("simulated task failure");
    expect(write("timeline_events", "upsert")).toBeUndefined();
  });
  it("reuses the task committed by a competing webhook worker", async () => {
    result("recruitment_email_sequences", sequence); result("timeline_events");
    result("recruitment_email_sequences"); result("tasks"); result("relationships", relationship);
    result("tasks", null, Object.assign(new Error("duplicate"), { code: "23505" }));
    result("tasks", { id: "concurrent-winner" }); result("timeline_events");
    expect(await processBrevoInboundReplies({ items: [item] })).toMatchObject({ processed: 1 });
    expect(write("timeline_events", "upsert")).toMatchObject({ metadata: { follow_up_task_id: "concurrent-winner" } });
    expect(calls.filter(c => c.table === "tasks" && c.method === "insert")).toHaveLength(1);
  });
  it("does not swallow an unrelated unique constraint error", async () => {
    result("recruitment_email_sequences", sequence); result("timeline_events");
    result("recruitment_email_sequences"); result("tasks"); result("relationships", relationship);
    result("tasks", null, Object.assign(new Error("unrelated duplicate"), { code: "23505" }));
    result("tasks");
    await expect(processBrevoInboundReplies({ items: [item] })).rejects.toThrow("unrelated duplicate");
    expect(write("timeline_events", "upsert")).toBeUndefined();
  });

});

