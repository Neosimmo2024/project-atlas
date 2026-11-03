import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/service-role", () => ({ createSupabaseServiceRoleClient: () => ({ rpc }) }));
import { reserveVscEmail, beginVscEmail, releaseVscEmail, recordVscEmailResult } from "./vsc-email-reservations";
const tenant = "20000000-0000-0000-0000-000000000001", delivery = "30000000-0000-0000-0000-000000000001", token = "40000000-0000-0000-0000-000000000001";
describe("VSC inert reservation services", () => {
  beforeEach(() => { vi.stubEnv("VSC_OVH_TENANT_ID", tenant); rpc.mockReset(); rpc.mockResolvedValue({ data: null, error: null }); });
  afterEach(() => vi.unstubAllEnvs());
  it("rejects foreign tenants and malformed identifiers before database access", async () => {
    await expect(reserveVscEmail("20000000-0000-0000-0000-000000000002", delivery)).rejects.toThrow();
    await expect(reserveVscEmail(tenant, "invalid")).rejects.toThrow();
    await expect(beginVscEmail(tenant, delivery, "invalid")).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("reserves a delivery only through the server RPC", async () => {
    expect(await reserveVscEmail(tenant, delivery)).toBeNull();
    expect(rpc).toHaveBeenCalledWith("vsc_reserve_email_delivery", { p_tenant_id: tenant, p_delivery_id: delivery });
  });
  it("requires the reservation token for starting and releasing", async () => {
    await beginVscEmail(tenant, delivery, token); await releaseVscEmail(tenant, delivery, token);
    for (const name of ["vsc_begin_email_dispatch", "vsc_release_email_reservation"]) expect(rpc).toHaveBeenCalledWith(name, { p_tenant_id: tenant, p_delivery_id: delivery, p_claim_token: token });
  });
  it("rejects a sent result without identity and ambiguous results with a claimed provider ID", async () => {
    await expect(recordVscEmailResult(tenant, delivery, token, "sent")).rejects.toThrow();
    await expect(recordVscEmailResult(tenant, delivery, token, "unknown", "id")).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("records uncertainty without claiming success or retrying the provider", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    expect(await recordVscEmailResult(tenant, delivery, token, "unknown")).toBe(true);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("vsc_record_email_dispatch_result", { p_tenant_id: tenant, p_delivery_id: delivery, p_claim_token: token, p_result: "unknown", p_message_id: null });
  });
  it("fails closed and does not automatically repeat a failed database operation", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "private detail" } });
    await expect(reserveVscEmail(tenant, delivery)).rejects.toThrow("indisponible"); expect(rpc).toHaveBeenCalledTimes(1);
  });
});
