import { beforeEach, describe, expect, it, vi } from "vitest";
const { from, upsert, single, update, eq, maybeSingle } = vi.hoisted(() => ({ from: vi.fn(), upsert: vi.fn(), single: vi.fn(), update: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() }));
vi.mock("@/lib/supabase/service-role", () => ({ createSupabaseServiceRoleClient: () => ({ from }) }));
import { loadVscImapCursor, saveVscImapCursor } from "./vsc-imap-cursor";
const cursor = { uidValidity: "42", lastUid: 200, version: 7 };
const batch = { uidValidity: "42", lastUid: 400, scanned: 1, hasMore: false, envelopes: [] };
describe("VSC persistent checkpoint", () => {
  beforeEach(() => {
    vi.resetAllMocks(); process.env.VSC_OVH_TENANT_ID = "vsc";
    const q = { select: vi.fn(), eq, single, update, upsert, maybeSingle };
    q.select.mockReturnValue(q); eq.mockReturnValue(q); update.mockReturnValue(q); from.mockReturnValue(q);
    upsert.mockResolvedValue({ error: null }); single.mockResolvedValue({ data: { uid_validity: "42", last_uid: "200", version: 7 }, error: null });
    maybeSingle.mockResolvedValue({ data: { tenant_id: "vsc" }, error: null });
  });
  it("initializes without overwriting an existing checkpoint", async () => {
    expect(await loadVscImapCursor("vsc")).toEqual(cursor);
    expect(upsert).toHaveBeenCalledWith({ tenant_id: "vsc" }, { onConflict: "tenant_id", ignoreDuplicates: true });
  });
  it("compares tenant and version before advancing", async () => {
    await saveVscImapCursor("vsc", cursor, batch);
    expect(eq).toHaveBeenCalledWith("tenant_id", "vsc"); expect(eq).toHaveBeenCalledWith("version", 7);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ last_uid: 400, version: 8, uid_validity: "42" }));
  });
  it("rejects a stale checkpoint rather than overwriting it", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null }); await expect(saveVscImapCursor("vsc", cursor, batch)).rejects.toThrow("concurrente");
  });
  it("rejects another tenant before any database operation", async () => {
    await expect(loadVscImapCursor("neos")).rejects.toThrow(); await expect(saveVscImapCursor("neos", cursor, batch)).rejects.toThrow(); expect(from).not.toHaveBeenCalled();
  });
});
