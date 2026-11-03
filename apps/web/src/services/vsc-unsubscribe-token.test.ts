import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVscUnsubscribeToken, verifyVscUnsubscribeToken, createVscUnsubscribeUrl } from "./vsc-unsubscribe-token";
const tenant = "20000000-0000-0000-0000-000000000001", person = "30000000-0000-0000-0000-000000000001";
describe("VSC signed opt-out links", () => {
  beforeEach(() => { vi.stubEnv("VSC_OVH_TENANT_ID", tenant); vi.stubEnv("VSC_UNSUBSCRIBE_SIGNING_KEY", "synthetic-signing-key-for-tests-0123456789"); vi.stubEnv("VSC_PUBLIC_BASE_URL", "https://vsc.example.com"); });
  afterEach(() => vi.unstubAllEnvs());
  it("binds the link to one tenant, person and email channel", () => {
    const token = createVscUnsubscribeToken(tenant, person);
    expect(verifyVscUnsubscribeToken(token)).toEqual({ v: 1, tenantId: tenant, personId: person, channel: "email" });
    expect(createVscUnsubscribeUrl(tenant, person)).toContain("https://vsc.example.com/vsc-unsubscribe?token=");
  });
  it("rejects modified payloads and signatures", () => {
    const token = createVscUnsubscribeToken(tenant, person);
    expect(verifyVscUnsubscribeToken("x" + token)).toBeNull();
    expect(verifyVscUnsubscribeToken(token.slice(0, -4) + "AAAA")).toBeNull();
    expect(verifyVscUnsubscribeToken(token + ".extra")).toBeNull();
  });
  it("rejects another tenant and a missing or short signing key", () => {
    const token = createVscUnsubscribeToken(tenant, person);
    vi.stubEnv("VSC_OVH_TENANT_ID", "20000000-0000-0000-0000-000000000002"); expect(verifyVscUnsubscribeToken(token)).toBeNull();
    expect(() => createVscUnsubscribeToken(tenant, person)).toThrow();
    vi.stubEnv("VSC_UNSUBSCRIBE_SIGNING_KEY", "short"); expect(verifyVscUnsubscribeToken(token)).toBeNull();
  });
  it("does not accept an unsafe base URL", () => {
    for (const url of ["http://vsc.example.com", "https://user:password@vsc.example.com", "https://vsc.example.com/?other=1"]) {
      vi.stubEnv("VSC_PUBLIC_BASE_URL", url); expect(() => createVscUnsubscribeUrl(tenant, person)).toThrow();
    }
  });
});
