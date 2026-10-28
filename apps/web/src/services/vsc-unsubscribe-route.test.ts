import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { unsubscribe } = vi.hoisted(() => ({ unsubscribe: vi.fn() }));
vi.mock("@/services/vsc-contact-stop", () => ({ unsubscribeVscContact: unsubscribe }));
import { GET, POST } from "@/app/vsc-unsubscribe/route";
import { createVscUnsubscribeToken } from "./vsc-unsubscribe-token";
const tenant = "20000000-0000-0000-0000-000000000001", person = "30000000-0000-0000-0000-000000000001";
const base = "https://vsc.example.com/vsc-unsubscribe";
let token: string;
function post(value = token, origin = "https://vsc.example.com") {
  return new Request(base, { method: "POST", headers: { origin, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: value }) });
}
describe("VSC public unsubscribe confirmation", () => {
  beforeEach(() => {
    vi.stubEnv("VSC_OVH_TENANT_ID", tenant); vi.stubEnv("VSC_UNSUBSCRIBE_SIGNING_KEY", "synthetic-signing-key-for-tests-0123456789");
    token = createVscUnsubscribeToken(tenant, person); unsubscribe.mockReset(); unsubscribe.mockResolvedValue({ cancelled: 2 });
  });
  afterEach(() => vi.unstubAllEnvs());
  it("GET renders confirmation without changing consent", async () => {
    const response = await GET(new Request(`${base}?token=${token}`));
    expect(response.status).toBe(200); expect(await response.text()).toContain("Confirmer ma désinscription"); expect(unsubscribe).not.toHaveBeenCalled();
    expect(response.headers.get("referrer-policy")).toBe("no-referrer"); expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("POST confirms only the signed contact and channel", async () => {
    const response = await POST(post()); expect(response.status).toBe(200); expect(unsubscribe).toHaveBeenCalledWith(tenant, person, "email");
  });
  it("rejects invalid tokens and cross-origin requests", async () => {
    expect((await GET(new Request(`${base}?token=invalid`))).status).toBe(400);
    expect((await POST(post("invalid"))).status).toBe(400);
    expect((await POST(post(token, "https://other.example.com"))).status).toBe(403);
    expect((await POST(post(token, ""))).status).toBe(403); expect(unsubscribe).not.toHaveBeenCalled();
  });
  it("rejects oversized forms without a mutation", async () => {
    expect((await POST(post("x".repeat(5000)))).status).toBe(400); expect(unsubscribe).not.toHaveBeenCalled();
  });
  it("does not claim success when the database is unavailable", async () => {
    unsubscribe.mockRejectedValue(new Error("offline")); expect((await POST(post())).status).toBe(503);
  });
});
