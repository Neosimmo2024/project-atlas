import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/types/domain";

const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  get: vi.fn(),
  save: vi.fn()
}));

vi.mock("@/repositories/tenant-context", () => ({ getTenantContext: mocks.context }));
vi.mock("@/repositories/talent-qualifications", () => ({
  getTalentQualification: mocks.get,
  saveTalentQualification: mocks.save
}));

const context: TenantContext = {
  tenantId: "tenant-a", tenant: { id: "tenant-a", name: "Tenant A" }, userId: "user-a", role: "recruiter"
};

const payload = {
  experience_level: "Confirmé", professional_status: "Indépendant", years_in_real_estate: "5",
  vat_situation: "Assujetti", current_network: "Réseau A", geographic_area: "94",
  availability: "3 mois", motivation: "Évoluer", primary_need: "Accompagnement",
  project_maturity: "Avancé", comments: "RAS", conclusion: "continue"
};

describe("talent qualification API", () => {
  beforeEach(() => {
    mocks.context.mockReset().mockResolvedValue(context);
    mocks.get.mockReset(); mocks.save.mockReset();
  });

  it("ignores any browser tenant id and saves a draft with server context", async () => {
    const { PUT } = await import("../../app/api/people/[id]/qualification/route");
    mocks.save.mockResolvedValue({ id: "qualification-a", state: "draft" });
    const response = await PUT(new Request("http://localhost/api/people/person-a/qualification", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, action: "draft", tenant_id: "tenant-b" })
    }), { params: Promise.resolve({ id: "person-a" }) });
    expect(response.status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith(context, "person-a", expect.not.objectContaining({ tenant_id: "tenant-b" }), false);
  });

  it("rejects finalization without a deliberate conclusion", async () => {
    const { PUT } = await import("../../app/api/people/[id]/qualification/route");
    const response = await PUT(new Request("http://localhost/api/people/person-a/qualification", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, conclusion: "", action: "finalize" })
    }), { params: Promise.resolve({ id: "person-a" }) });
    expect(response.status).toBe(400);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("finalizes only after the explicit finalize action", async () => {
    const { PUT } = await import("../../app/api/people/[id]/qualification/route");
    mocks.save.mockResolvedValue({ id: "qualification-a", state: "completed" });
    const response = await PUT(new Request("http://localhost/api/people/person-a/qualification", {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...payload, action: "finalize" })
    }), { params: Promise.resolve({ id: "person-a" }) });
    expect(response.status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith(context, "person-a", expect.objectContaining({ conclusion: "continue" }), true);
  });
});
