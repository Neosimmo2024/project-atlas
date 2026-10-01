import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ context: vi.fn(), db: vi.fn(), upsert: vi.fn(), select: vi.fn(), eq: vi.fn(), single: vi.fn() }));
vi.mock("@/repositories/tenant-context", () => ({ getTenantContext: mocks.context }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.db }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(url); } }));
import { saveProspectReview } from "./review-actions";
const form = () => {
  const f = new FormData();
  for (const [k,v] of Object.entries({ listId: "11111111-1111-4111-8111-111111111111", siret: "12345678900012", status: "pending", kind: "unknown", email: "", phone: "", sourceUrl: "", notes: "" })) f.set(k,v);
  return f;
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue({ tenantId: "real-tenant", userId: "real-user", role: "owner" });
  const query = { select: mocks.select, eq: mocks.eq, maybeSingle: mocks.single, upsert: mocks.upsert };
  mocks.select.mockReturnValue(query); mocks.eq.mockReturnValue(query);
  mocks.db.mockResolvedValue({ from: () => query });
  mocks.single.mockResolvedValue({ data: { candidates: [{ siret: "12345678900012", name: "Test", city: "Test", postalCode: "94100" }] }, error: null });
  mocks.upsert.mockResolvedValue({ error: null });
});
it("denies readers before database access", async () => {
  mocks.context.mockResolvedValue({ role: "reader" });
  await expect(saveProspectReview(form())).rejects.toThrow("Vous ne pouvez pas");
  expect(mocks.db).not.toHaveBeenCalled();
});
it("ignores posted tenant and reviewer identity", async () => {
  const f = form(); f.set("tenant_id", "foreign"); f.set("reviewed_by", "foreign");
  await expect(saveProspectReview(f)).rejects.toThrow("review=saved");
  expect(mocks.eq).toHaveBeenCalledWith("tenant_id", "real-tenant");
  expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ tenant_id: "real-tenant", reviewed_by: "real-user" }), { onConflict: "list_id,siret" });
});
it("rejects a candidate outside the saved list", async () => {
  const f = form(); f.set("siret", "98765432100012");
  await expect(saveProspectReview(f)).rejects.toThrow("review=failed");
  expect(mocks.upsert).not.toHaveBeenCalled();
});
it("refuses an inaccessible list and does not report a failed save as success", async () => {
  mocks.single.mockResolvedValueOnce({ data: null, error: null });
  await expect(saveProspectReview(form())).rejects.toThrow("review=failed");
  mocks.upsert.mockResolvedValue({ error: { message: "private" } });
  await expect(saveProspectReview(form())).rejects.toThrow("review=failed");
});
it("rejects incomplete qualification before database access", async () => {
  const f = form(); f.set("status", "qualified");
  await expect(saveProspectReview(f)).rejects.toThrow("review=invalid");
  expect(mocks.db).not.toHaveBeenCalled();
});
