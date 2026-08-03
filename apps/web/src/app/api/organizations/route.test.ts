import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getTenantContext: vi.fn(),
  findPotentialOrganizationDuplicates: vi.fn(),
  createOrganization: vi.fn(),
  listOrganizations: vi.fn()
}));

vi.mock("@/repositories/tenant-context", () => ({
  getTenantContext: mocks.getTenantContext
}));

vi.mock("@/repositories/organizations", () => ({
  findPotentialOrganizationDuplicates: mocks.findPotentialOrganizationDuplicates,
  createOrganization: mocks.createOrganization,
  listOrganizations: mocks.listOrganizations
}));

const context = {
  tenantId: "tenant-a",
  userId: "user-a",
  role: "owner",
  tenant: { id: "tenant-a", name: "Atlas QA Beta 1" }
};

function request(body: Record<string, unknown>) {
  return new Request("https://atlas.test/api/organizations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("organizations API route", () => {
  beforeEach(() => {
    mocks.getTenantContext.mockReset();
    mocks.findPotentialOrganizationDuplicates.mockReset();
    mocks.createOrganization.mockReset();
    mocks.listOrganizations.mockReset();
  });

  it("creates an organization with a verifier VAT status", async () => {
    const { POST } = await import("./route");
    mocks.getTenantContext.mockResolvedValue(context);
    mocks.findPotentialOrganizationDuplicates.mockResolvedValue([]);
    mocks.createOrganization.mockResolvedValue({
      id: "organization-a",
      tenant_id: context.tenantId,
      name: "Reseau Test Atlas",
      vat_status: "a_verifier"
    });

    const response = await POST(request({
      name: "Reseau Test Atlas",
      organization_type: "network",
      status: "active",
      vat_status: "a_verifier"
    }));

    expect(response.status).toBe(201);
    expect(mocks.createOrganization).toHaveBeenCalledWith(context, expect.objectContaining({
      name: "Reseau Test Atlas",
      organization_type: "network",
      status: "active",
      vat_status: "a_verifier"
    }));
  });

  it("creates an organization when VAT status is omitted", async () => {
    const { POST } = await import("./route");
    mocks.getTenantContext.mockResolvedValue(context);
    mocks.findPotentialOrganizationDuplicates.mockResolvedValue([]);
    mocks.createOrganization.mockResolvedValue({
      id: "organization-b",
      tenant_id: context.tenantId,
      name: "Agence Sans TVA",
      vat_status: null
    });

    const response = await POST(request({
      name: "Agence Sans TVA",
      organization_type: "agency",
      status: "active"
    }));

    expect(response.status).toBe(201);
    expect(mocks.createOrganization).toHaveBeenCalledWith(context, expect.objectContaining({
      name: "Agence Sans TVA",
      organization_type: "agency",
      status: "active"
    }));
  });
});
