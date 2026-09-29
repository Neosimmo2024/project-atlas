import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { runBrevoContactPilot as run, brevoPilotPersonId as personId } from "./brevo-contact-pilot";
const m = vi.hoisted(() => ({ context: vi.fn(), scope: vi.fn(), binding: vi.fn(), source: vi.fn(), read: vi.fn(), journal: vi.fn(), sync: vi.fn(), channels: vi.fn(), db: vi.fn(), previous: vi.fn() }));
vi.mock("./tenant-context", () => ({ getTenantContext: m.context }));
vi.mock("./brevo-account-diagnostic", () => ({ isBrevoQaScope: m.scope }));
vi.mock("@/services/brevo-account-binding", () => ({ verifyBrevoAccountBinding: m.binding }));
vi.mock("./brevo-contact-source", () => ({ createAuthorizedBrevoContactSource: m.source }));
vi.mock("./brevo-contact-journal", () => ({ createBrevoContactJournal: m.journal }));
vi.mock("@/services/brevo-contact-journal", () => ({ syncBrevoContactWithJournal: m.sync }));
vi.mock("@/services/brevo-pilot-channels", () => ({ ensureBrevoPilotChannels: m.channels }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: m.db }));
const tenantId = "8e27b0ff-3f1a-41fa-8390-628c718723a2";
const person = { tenantId, personId, email: "atlas-pilot-20260929@example.invalid", contactAllowed: true, doNotContact: false };
const actor = { tenantId, userId: "owner-id", role: "owner" };
const confirmation = "create_one_blocklisted_test_contact";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ATLAS_BREVO_CONTACT_TENANT_ID", tenantId); vi.stubEnv("ATLAS_BREVO_ORGANIZATION_ID", "69aae9fea303e8f4220b4e98"); vi.stubEnv("BREVO_API_KEY", "fixture-key");
  m.scope.mockReturnValue(true); m.context.mockResolvedValue(actor); m.binding.mockResolvedValue({ status: "verified" });
  m.read.mockResolvedValue({ ...person }); m.source.mockResolvedValue({ readPerson: m.read }); m.journal.mockResolvedValue({});
  m.sync.mockImplementation(async (_target, options) => { await options.readPerson(_target); return { status: "created", contactId: 99 }; });
  m.channels.mockImplementation(async o => { await o.authorize(); return { status: "verified", contactId: 99, sms: "not_configured", senderCount: 1 }; });
  const query = { select: vi.fn(), eq: vi.fn(), limit: vi.fn(), maybeSingle: m.previous };
  for (const fn of [query.select, query.eq, query.limit]) fn.mockReturnValue(query);
  m.db.mockResolvedValue({ from: vi.fn().mockReturnValue(query) }); m.previous.mockResolvedValue({ data: null, error: null });
});
afterEach(() => vi.unstubAllEnvs());
it("requires explicit confirmation before any access", async () => { expect((await run("")).status).toBe("confirmation_required"); expect(m.context).not.toHaveBeenCalled(); });
it("rejects non-QA environments", async () => { m.scope.mockReturnValue(false); expect((await run(confirmation)).status).toBe("scope_rejected"); expect(m.sync).not.toHaveBeenCalled(); });
it.each([null, { ...actor, role: "admin" }, { ...actor, tenantId: "foreign" }])("rejects unauthorized actor %j", async actor => { m.context.mockResolvedValue(actor); expect((await run(confirmation)).status).toBe("forbidden"); expect(m.binding).not.toHaveBeenCalled(); });
it("rejects a mismatched server binding", async () => { vi.stubEnv("ATLAS_BREVO_ORGANIZATION_ID", "other"); expect((await run(confirmation)).status).toBe("scope_rejected"); expect(m.sync).not.toHaveBeenCalled(); });
it("requires the provider account to match before any write", async () => { m.binding.mockResolvedValue({ status: "account_mismatch" }); expect((await run(confirmation)).status).toBe("account_unverified"); expect(m.sync).not.toHaveBeenCalled(); });
it.each([{ ...person, email: "real@example.com" }, { ...person, personId: "other" }, { ...person, doNotContact: true }, null])("rejects a changed fictitious source %j", async p => { m.read.mockResolvedValue(p); expect((await run(confirmation)).status).toBe("unavailable"); expect(m.sync).not.toHaveBeenCalled(); });
it("creates only the fixed fixture with blacklisting and reads back the provider id", async () => {
  expect(await run(confirmation)).toEqual({ status: "created_verified", contactId: 99 });
  expect(m.sync).toHaveBeenCalledWith({ tenantId, personId }, expect.objectContaining({ enabled: true, apiKey: "fixture-key", createBlacklisted: true }));
});
it("second click only verifies the original id without another write", async () => {
  await run(confirmation); m.previous.mockResolvedValue({ data: { provider_contact_id: 99 }, error: null });
  expect(await run(confirmation)).toEqual({ status: "existing_verified", contactId: 99 }); expect(m.sync).toHaveBeenCalledTimes(1);
});
it("does not recreate a successful pilot when channel verification fails", async () => {
  m.previous.mockResolvedValue({ data: { provider_contact_id: 99 }, error: null });
  m.channels.mockResolvedValue({ status: "channels_unconfirmed" });
  expect((await run(confirmation)).status).toBe("channels_unconfirmed"); expect(m.sync).not.toHaveBeenCalled();
});
it("does not adopt an existing contact without its recorded successful id", async () => {
  m.sync.mockResolvedValue({ status: "skipped" });
  expect((await run(confirmation)).status).toBe("verification_required"); expect(m.channels).not.toHaveBeenCalled();
});
it("passes the fixed identity and fresh authorization to channel enforcement", async () => {
  await run(confirmation);
  expect(m.channels).toHaveBeenCalledWith(expect.objectContaining({ contactId: 99, email: person.email, externalId: `atlas:${tenantId}:${personId}` }));
});
it("rechecks owner permissions before reading or writing the source", async () => {
  m.context.mockResolvedValueOnce(actor).mockResolvedValue({ ...actor, role: "admin" });
  expect((await run(confirmation)).status).toBe("unavailable"); expect(m.sync).not.toHaveBeenCalled();
});
it("never retries an uncertain write", async () => { m.sync.mockResolvedValue({ status: "write_outcome_unknown" }); expect((await run(confirmation)).status).toBe("write_outcome_unknown"); expect(m.sync).toHaveBeenCalledTimes(1); expect(m.channels).not.toHaveBeenCalled(); });
