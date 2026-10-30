import { beforeEach, describe, expect, it, vi } from "vitest";

const maybeSingle = vi.fn();
const peopleIn = vi.fn();
const upsert = vi.fn();
const from = vi.fn((table: string) => {
  if (table === "vsc_campaigns") return {
    select: () => ({ eq: () => ({ eq: () => ({ maybeSingle }) }) })
  };
  if (table === "people") return {
    select: () => ({ eq: () => ({ in: peopleIn }) })
  };
  if (table === "vsc_campaign_deliveries") return { upsert };
  throw new Error("Unexpected table " + table);
});
vi.mock("@/lib/supabase/service-role", () => ({
  createSupabaseServiceRoleClient: () => ({ from })
}));
import { saveVscDraftPlan } from "./vsc-campaign-drafts";

const tenantId = "11111111-1111-4111-8111-111111111111";
const campaignId = "22222222-2222-4222-8222-222222222222";
const leadId = "33333333-3333-4333-8333-333333333333";
const plan = [{ key: "vsc:lead:offer", leadId, tenantId, channel: "email" as const,
  stepKey: "offer", scheduledDate: "2026-10-28", status: "draft" as const }];

describe("VSC draft persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    maybeSingle.mockResolvedValue({ data: { id: campaignId, tenant_id: tenantId, state: "draft" }, error: null });
    peopleIn.mockResolvedValue({ data: [{ id: leadId }], error: null });
    upsert.mockResolvedValue({ error: null });
  });
  it("refuses cross-tenant drafts before touching the database", async () => {
    await expect(saveVscDraftPlan({ tenantId, campaignId,
      plan: [{ ...plan[0], tenantId: "44444444-4444-4444-8444-444444444444" }]
    })).rejects.toThrow();
    expect(from).not.toHaveBeenCalled();
  });
  it("rejects impossible calendar dates before accessing the database", async () => {
    for (const scheduledDate of ["2026-02-31", "2026-02-29", "2026-00-10", "2026-10-00"]) {
      await expect(saveVscDraftPlan({ tenantId, campaignId, plan: [{ ...plan[0], scheduledDate }] })).rejects.toThrow();
    }
    expect(from).not.toHaveBeenCalled();
  });
  it("refuses a campaign that is no longer a draft", async () => {
    maybeSingle.mockResolvedValue({ data: { state: "active" }, error: null });
    await expect(saveVscDraftPlan({ tenantId, campaignId, plan })).rejects.toThrow();
    expect(upsert).not.toHaveBeenCalled();
  });
  it("stores only a tenant-checked draft with no send operation", async () => {
    expect(await saveVscDraftPlan({ tenantId, campaignId, plan })).toEqual({ submitted: 1 });
    expect(upsert).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ tenant_id: tenantId, campaign_id: campaignId, status: "draft" })
    ]), expect.objectContaining({ ignoreDuplicates: true }));
  });
});
