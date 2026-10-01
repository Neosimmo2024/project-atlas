import { searchEnterprises, searchInput, type ProspectCandidate } from "./enterprise-search";
import type { z } from "zod";

// Bounded synchronous collection: at most 20 pages, three requests at a time.
// A failed or changing source never produces a silently partial saved list.
export async function searchAllEnterprises(input: z.input<typeof searchInput>, search = searchEnterprises) {
  const parsed = searchInput.parse(input);
  const first = await search({ ...parsed, page: 1 });
  if (first.sourcePages > 20) throw new Error("PROSPECT_TARGET_TOO_LARGE");
  const candidates = new Map<string, ProspectCandidate>();
  const add = (result: Awaited<ReturnType<typeof searchEnterprises>>) => {
    if (result.sourcePages !== first.sourcePages || result.sourceTotal !== first.sourceTotal) throw new Error("PROSPECT_SOURCE_CHANGED");
    for (const candidate of result.candidates) candidates.set(candidate.siret, candidate);
    if (candidates.size > 2500) throw new Error("PROSPECT_TARGET_TOO_LARGE");
  };
  add(first);
  for (let page = 2; page <= first.sourcePages; page += 3) {
    const batch = Array.from({ length: Math.min(3, first.sourcePages - page + 1) }, (_, offset) => page + offset);
    const results = await Promise.all(batch.map(page => search({ ...parsed, page })));
    results.forEach(add);
  }
  return { ...first, candidates: [...candidates.values()] };
}
