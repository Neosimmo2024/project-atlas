import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/service-role", () => ({ createSupabaseServiceRoleClient: () => ({ rpc }) }));
import { getVscSmsDraftContacts } from "./vsc-sms-draft-contacts";
const tenant = "20000000-0000-0000-0000-000000000001";
describe("VSC read-only mobile candidates", () => {
  beforeEach(() => { vi.stubEnv("VSC_OVH_TENANT_ID", tenant); rpc.mockReset(); });
  afterEach(() => vi.unstubAllEnvs());
  it("refuses unconfigured, malformed and foreign tenants before database access", async () => {
    for (const id of ["", "invalid", "20000000-0000-0000-0000-000000000002"]) await expect(getVscSmsDraftContacts(id)).rejects.toThrow("non autorisée");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("uses only the tenant-scoped read RPC and keeps dispatch disabled", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await getVscSmsDraftContacts(tenant)).toEqual({ contacts: [], truncated: false, sendingEnabled: false });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("vsc_sms_draft_contacts", { p_tenant_id: tenant });
  });
  it("limits output and reports truncation without hiding database failures", async () => {
    rpc.mockResolvedValue({ data: Array.from({ length: 101 }, () => ({ id: "fixture", mobile: "+33600000000", display_name: "Fixture", has_email: false })), error: null });
    const result = await getVscSmsDraftContacts(tenant); expect(result.contacts).toHaveLength(100); expect(result.truncated).toBe(true);
    rpc.mockResolvedValue({ data: null, error: { message: "private detail" } });
    await expect(getVscSmsDraftContacts(tenant)).rejects.toThrow("indisponible");
  });
});
