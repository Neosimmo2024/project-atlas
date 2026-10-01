import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ context: vi.fn(), search: vi.fn(), insert: vi.fn(), database: vi.fn() }));
vi.mock("@/repositories/tenant-context", () => ({ getTenantContext: mocks.context }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.database }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(url); } }));
vi.mock("@/features/prospect-discovery/enterprise-search", async (original) => ({
  ...await original<object>(), searchEnterprises: mocks.search
}));
import { saveProspectList } from "./actions";
const form = () => { const f = new FormData(); f.set("name", "Saint-Maur"); f.set("postalCode", "94100"); f.set("page", "1"); return f; };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue({ tenantId: "tenant-real", userId: "user-real", role: "owner" });
  mocks.database.mockResolvedValue({ from: () => ({ insert: mocks.insert }) });
  mocks.insert.mockResolvedValue({ error: null });
  mocks.search.mockResolvedValue({ candidates: [{ name: "Source candidate" }] });
});
it("refuse un lecteur avant tout appel externe", async () => {
  mocks.context.mockResolvedValue({ role: "reader" });
  await expect(saveProspectList(form())).rejects.toThrow("Vous ne pouvez pas");
  expect(mocks.search).not.toHaveBeenCalled();
});
it("utilise le tenant authentifié et relit les candidats à la source", async () => {
  const f = form(); f.set("tenant_id", "attacker"); f.set("candidates", "invented");
  await expect(saveProspectList(f)).rejects.toThrow("saved=1");
  expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ tenant_id: "tenant-real", created_by: "user-real", candidates: [{ name: "Source candidate" }] }));
});
it("ne confirme pas un échec d'écriture", async () => {
  mocks.insert.mockResolvedValue({ error: { message: "private details" } });
  await expect(saveProspectList(form())).rejects.toThrow("saved=0");
});
it("ne sauvegarde pas une liste vide", async () => {
  mocks.search.mockResolvedValue({ candidates: [] });
  await expect(saveProspectList(form())).rejects.toThrow("saved=0");
  expect(mocks.insert).not.toHaveBeenCalled();
});
