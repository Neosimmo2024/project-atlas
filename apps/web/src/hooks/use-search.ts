"use client";

import { useDeferredValue, useMemo, useState } from "react";

export function normalizeSearchQuery(query: string) {
  return query.trim().toLowerCase();
}

export function useSearch(initialQuery = "") {
  const [query, setQuery] = useState(initialQuery);
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = useMemo(() => normalizeSearchQuery(deferredQuery), [deferredQuery]);

  return {
    query,
    setQuery,
    deferredQuery,
    normalizedQuery,
    hasQuery: normalizedQuery.length > 0
  };
}
