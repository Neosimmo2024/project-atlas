import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/types/domain";
import { canManageIonos, IONOS_SENDER } from "./ionos-connection";

const tenantId = "11111111-1111-4111-8111-111111111111";
const context = { tenantId, role: "owner" } as TenantContext;

beforeEach(() => vi.stubEnv("LFI_IONOS_TENANT_ID", tenantId));
afterEach(() => vi.unstubAllEnvs());

describe("IONOS incoming mailbox access", () => {
  it("allows only the configured tenant owner or admin", () => {
    expect(canManageIonos(context)).toBe(true);
    expect(canManageIonos({ ...context, role: "admin" })).toBe(true);
    expect(canManageIonos({ ...context, role: "reader" })).toBe(false);
    expect(canManageIonos({ ...context, tenantId: "another-tenant" })).toBe(false);
  });

  it("keeps the incoming mailbox identity fixed", () => {
    expect(IONOS_SENDER).toBe("contact@lesformateursimmo.com");
  });
});
