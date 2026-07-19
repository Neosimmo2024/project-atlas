import { describe, expect, it } from "vitest";
import { getPaginationState } from "./use-pagination";
import { normalizeSearchQuery } from "./use-search";

describe("foundation hooks helpers", () => {
  it("normalizes search input consistently with useSearch", () => {
    expect(normalizeSearchQuery("  Renato PONZIO  ")).toBe("renato ponzio");
  });

  it("computes pagination state consistently with usePagination", () => {
    expect(getPaginationState({ page: 2, pageCount: 4, total: 39 })).toEqual({
      page: 2,
      pageCount: 4,
      total: 39,
      hasPrevious: true,
      hasNext: true,
      previousPage: 1,
      nextPage: 3
    });
  });
});
