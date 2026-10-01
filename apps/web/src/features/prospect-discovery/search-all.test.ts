import { expect, it, vi } from "vitest";
import { searchAllEnterprises } from "./search-all";
import type { searchEnterprises } from "./enterprise-search";
const candidate = (siret: string) => ({ siret, siren: siret.slice(0, 9), name: "Test", city: "Saint-Maur", postalCode: "94100", kind: "À qualifier", sourceUrl: "https://example.com", checkedAt: "today" });
const result = (page: number, candidates = [candidate("12345678900012")]) => ({ candidates, sourcePages: 5, sourceTotal: 101, page, postalCode: "94100", target: "saint_maur" as const });
it("starts on page one, visits every page and deduplicates SIRET across pages", async () => {
  const search = vi.fn<typeof searchEnterprises>().mockImplementation(async input => result(input.page as number, input.page === 5 ? [candidate("12345678900020")] : undefined));
  const all = await searchAllEnterprises({ postalCode: "94100", target: "saint_maur", page: 4 }, search);
  expect(search.mock.calls.map(([input]) => input.page)).toEqual([1, 2, 3, 4, 5]);
  expect(all.candidates).toHaveLength(2);
  expect(search.mock.calls.every(([input]) => input.target === "saint_maur")).toBe(true);
});
it("refuses a partial result if a page fails or the total changes", async () => {
  const failed = vi.fn<typeof searchEnterprises>().mockImplementation(async input => { if (input.page === 3) throw new Error("offline"); return result(input.page as number); });
  await expect(searchAllEnterprises({ postalCode: "94100" }, failed)).rejects.toThrow("offline");
  const changed = vi.fn<typeof searchEnterprises>().mockImplementation(async input => ({ ...result(input.page as number), sourceTotal: input.page === 3 ? 102 : 101 }));
  await expect(searchAllEnterprises({ postalCode: "94100" }, changed)).rejects.toThrow("PROSPECT_SOURCE_CHANGED");
});
it("rejects oversized targets before fetching subsequent pages", async () => {
  const search = vi.fn<typeof searchEnterprises>().mockResolvedValue({ ...result(1), sourcePages: 21 });
  await expect(searchAllEnterprises({ postalCode: "94100" }, search)).rejects.toThrow("PROSPECT_TARGET_TOO_LARGE");
  expect(search).toHaveBeenCalledTimes(1);
});
it("never has more than three page requests in flight", async () => {
  let active = 0; let peak = 0;
  const search = vi.fn<typeof searchEnterprises>().mockImplementation(async input => {
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 1)); active--;
    return result(input.page as number);
  });
  await searchAllEnterprises({ postalCode: "94100" }, search);
  expect(peak).toBe(3);
});
