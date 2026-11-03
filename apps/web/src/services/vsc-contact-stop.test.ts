import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { records, from } = vi.hoisted(() => ({ records: {} as Record<string, { data: unknown; error: unknown }>, from: vi.fn() }));
vi.mock("@/lib/supabase/service-role", () => ({ createSupabaseServiceRoleClient: () => ({ from }) }));
import { checkVscContactStop } from "./vsc-contact-stop";
const tenant = "20000000-0000-0000-0000-000000000001", person = "30000000-0000-0000-0000-000000000001";
describe("VSC fresh contact authorization", () => {
  beforeEach(() => {
    vi.stubEnv("VSC_OVH_TENANT_ID", tenant); from.mockReset();
    records.people = { data: { primary_email: "shop@fixture.invalid", do_not_contact: false, contact_allowed: true }, error: null };
    records.vsc_contact_suppressions = { data: [], error: null };
    records.vsc_inbound_replies = { data: [], error: null };
    from.mockImplementation((table: string) => {
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "eq", "in"]) chain[method] = vi.fn(() => chain);
      chain.maybeSingle = chain.limit = vi.fn(async () => records[table]);
      return chain;
    });
  });
  afterEach(() => vi.unstubAllEnvs());
  it("allows only an explicitly authorized current contact", async () => {
    expect(await checkVscContactStop(tenant, person, "SHOP@fixture.invalid")).toEqual({ stopped: false });
  });
  it("blocks false, null or missing contact authorization", async () => {
    for (const contact_allowed of [false, null, undefined]) {
      records.people.data = { primary_email: "shop@fixture.invalid", do_not_contact: false, contact_allowed };
      expect(await checkVscContactStop(tenant, person, "shop@fixture.invalid")).toEqual({ stopped: true });
    }
  });
  it("blocks missing people, changed addresses, opposition and known replies", async () => {
    records.people.data = null;
    expect((await checkVscContactStop(tenant, person, "shop@fixture.invalid")).stopped).toBe(true);
    records.people.data = { primary_email: "other@fixture.invalid", contact_allowed: true };
    expect((await checkVscContactStop(tenant, person, "shop@fixture.invalid")).stopped).toBe(true);
    records.people.data = { primary_email: "shop@fixture.invalid", contact_allowed: true, do_not_contact: true };
    expect((await checkVscContactStop(tenant, person, "shop@fixture.invalid")).stopped).toBe(true);
    records.people.data = { primary_email: "shop@fixture.invalid", contact_allowed: true, do_not_contact: false };
    records.vsc_contact_suppressions.data = [{ channel: "email" }];
    expect((await checkVscContactStop(tenant, person, "shop@fixture.invalid")).stopped).toBe(true);
    records.vsc_contact_suppressions.data = []; records.vsc_inbound_replies.data = [{ id: "reply" }];
    expect((await checkVscContactStop(tenant, person, "shop@fixture.invalid")).stopped).toBe(true);
  });
  it("fails closed on database errors", async () => {
    records.people.error = { message: "offline" };
    await expect(checkVscContactStop(tenant, person, "shop@fixture.invalid")).rejects.toThrow("indisponible");
  });
  it("rejects another tenant before database access", async () => {
    await expect(checkVscContactStop("20000000-0000-0000-0000-000000000002", person, "shop@fixture.invalid")).rejects.toThrow();
    expect(from).not.toHaveBeenCalled();
  });
});
