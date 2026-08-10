import type { TenantContext } from "@/types/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getTenantContext: vi.fn(),
  searchGlobally: vi.fn()
}));

vi.mock("@/repositories/tenant-context", () => ({
  getTenantContext: mocks.getTenantContext
}));

vi.mock("@/repositories/global-search", () => ({
  searchGlobally: mocks.searchGlobally
}));

const context: TenantContext = {
  tenantId: "tenant-a",
  tenant: { id: "tenant-a", name: "Tenant A" },
  userId: "user-a",
  role: "reader"
};

describe("global search API", () => {
  beforeEach(() => {
    mocks.getTenantContext.mockReset().mockResolvedValue(context);
    mocks.searchGlobally.mockReset().mockResolvedValue({ people: [], organizations: [], relationships: [], projects: [], interactions: [], tasks: [] });
  });

  it("rejects unauthenticated or suspended users without tenant context", async () => {
    const { GET } = await import("../../app/api/search/route");
    mocks.getTenantContext.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/search?query=atlas"));

    expect(response.status).toBe(401);
    expect(mocks.searchGlobally).not.toHaveBeenCalled();
  });

  it("does not run a search below two characters", async () => {
    const { GET } = await import("../../app/api/search/route");
    const response = await GET(new Request("http://localhost/api/search?query=a"));

    expect(response.status).toBe(400);
    expect(mocks.searchGlobally).not.toHaveBeenCalled();
  });

  it("uses only the server tenant context even if the browser sends a tenant_id", async () => {
    const { GET } = await import("../../app/api/search/route");
    const response = await GET(new Request("http://localhost/api/search?query=atlas&tenant_id=tenant-b"));

    expect(response.status).toBe(200);
    expect(mocks.searchGlobally).toHaveBeenCalledWith(context, "atlas");
  });
});

